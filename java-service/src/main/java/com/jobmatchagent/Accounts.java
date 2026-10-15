package com.jobmatchagent;

import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.mindrot.jbcrypt.BCrypt;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

final class Accounts {
    final Database db;
    private final byte[] secret;
    private final Map<String, String> env;
    private final HttpClient http;
    private final LegacyAuth legacy;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String DUMMY_HASH = BCrypt.hashpw("invalid-login-placeholder", BCrypt.gensalt(12));
    Accounts(Database db, Map<String, String> env, HttpClient http) {
        this.db = db; this.env = env; this.http = http;
        legacy = new LegacyAuth(env, http);
        String signingKey = env.getOrDefault("SESSION_SIGNING_SECRET", "");
        if (signingKey.length() < 32) throw new IllegalStateException("SESSION_SIGNING_SECRET must contain at least 32 random characters.");
        secret = signingKey.getBytes(StandardCharsets.UTF_8);
    }
    Map<String, Object> find(Connection connection, String email, boolean lock) throws SQLException {
        return one(connection, "SELECT * FROM jma_accounts WHERE email=?" + (lock ? " FOR UPDATE" : ""), email.toLowerCase(Locale.ROOT));
    }
    static UUID id(Map<String, Object> account) { return UUID.fromString(str(account, "id")); }
    static String email(String raw) {
        String email = raw.strip().toLowerCase(Locale.ROOT);
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") || email.length() > 254)
            throw new ApiException(400, "Enter a valid email address.");
        return email;
    }
    static void password(String value) {
        int size = value.getBytes(StandardCharsets.UTF_8).length;
        if (value.length() < 8 || size > 72) throw new ApiException(400, "Use a password between 8 and 72 bytes.");
    }
    Map<String, Object> create(Connection c, String mail, String name, String password, String role) throws Exception {
        String email = email(mail);
        if (find(c, email, false) != null) throw new ApiException(409, "An account with this email already exists.");
        Map<String, Object> metadata = of("user_name", name, "full_name", name, "role", role);
        Plans.set(metadata, Set.of("admin", "super_admin").contains(role) ? "lifetime" : "free", Instant.now());
        if (!password.isEmpty()) password(password);
        execute(c, "INSERT INTO jma_accounts(id,email,password_hash,metadata) VALUES(?,?,?,?)",
            UUID.randomUUID(), email, password.isEmpty() ? null : BCrypt.hashpw(password, BCrypt.gensalt(12)), stringify(metadata));
        execute(c, "INSERT INTO jma_usage(email) VALUES(?)", email);
        return find(c, email, false);
    }
    Map<String, Object> publicUser(Map<String, Object> account) {
        Map<String, Object> metadata = object(str(account, "metadata"));
        metadata.keySet().removeIf(key -> key.startsWith("_"));
        Map<String, Object> snapshot = Plans.snapshot(account);
        for (String key : List.of("planType", "subscriptionStartedAt", "lockedPanes", "unlockedPanes", "weeklyBonusDays", "weeklyFreeDayClaimedAt", "weeklyClaimPlanType")) metadata.put(key, snapshot.get(key));
        return of("id", account.get("id"), "email", account.get("email"), "role", "authenticated", "aud", "authenticated",
            "created_at", account.get("created_at"), "last_sign_in_at", account.get("last_sign_in_at"),
            "email_confirmed_at", account.get("created_at"), "app_metadata", of("provider", "email", "providers", List.of("email")),
            "user_metadata", metadata, "identities", List.of());
    }
    Map<String, Object> login(Map<String, Object> body) throws Exception {
        String email = email(str(body, "email"));
        String password = body.get("password") instanceof String value ? value : "";
        if (password.length() > 256) throw new ApiException(400, "Invalid email or password.");
        return db.transaction(c -> {
            Map<String, Object> account = find(c, email, true);
            String hash = account == null ? DUMMY_HASH : str(account, "password_hash");
            Map<String, Object> metadata = account == null ? of() : object(str(account, "metadata"));
            if (account != null && hash.isBlank() && bool(metadata.get("_legacy_password_pending")) && legacy.available()) {
                if (!legacy.verifyPassword(email, password)) throw new ApiException(400, "Invalid email or password.");
                password(password);
                hash = BCrypt.hashpw(password, BCrypt.gensalt(12));
                metadata.put("_legacy_password_pending", false); metadata.put("_neon_modified", true);
                execute(c, "UPDATE jma_accounts SET password_hash=?,metadata=? WHERE id=?", hash, stringify(metadata), id(account));
            }
            if (hash.startsWith("$2b$") || hash.startsWith("$2y$")) hash = "$2a$" + hash.substring(4);
            boolean valid;
            try { valid = !hash.isEmpty() && BCrypt.checkpw(password, hash); } catch (Exception e) { valid = false; }
            if (!valid || account == null) throw new ApiException(400, "Invalid email or password.");
            execute(c, "UPDATE jma_accounts SET last_sign_in_at=? WHERE id=?", Instant.now(), id(account));
            return issue(c, find(c, email, false));
        });
    }
    Map<String, Object> issue(Connection c, Map<String, Object> account) throws Exception {
        String refresh = random(48);
        UUID accessId = UUID.randomUUID();
        execute(c, "INSERT INTO jma_sessions(refresh_hash,account_id,access_id,expires_at) VALUES(?,?,?,?)",
            digest(refresh), id(account), accessId, Instant.now().plus(30, ChronoUnit.DAYS));
        return session(account, refresh, accessId);
    }
    Map<String, Object> session(Map<String, Object> account, String refresh, UUID accessId) throws Exception {
        long now = Instant.now().getEpochSecond();
        String encoded = encode(stringify(of("alg", "HS256", "typ", "JWT"))) + "." + encode(stringify(of(
            "iss", "jobmatchagent", "sub", account.get("id"), "email", account.get("email"), "role", "authenticated",
            "aud", "authenticated", "iat", now, "exp", now + 3600, "jti", accessId.toString())));
        String token = encoded + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(hmac(encoded));
        return of("access_token", token, "refresh_token", refresh, "token_type", "bearer", "expires_in", 3600,
            "expires_at", now + 3600, "user", publicUser(account));
    }
    Map<String, Object> refresh(String token) throws Exception {
        return db.transaction(c -> {
            Map<String, Object> row = one(c, "SELECT * FROM jma_sessions WHERE refresh_hash=? AND expires_at>CURRENT_TIMESTAMP FOR UPDATE", digest(token));
            if (row == null) throw new ApiException(401, "Your session has expired. Please sign in again.");
            execute(c, "DELETE FROM jma_sessions WHERE refresh_hash=?", digest(token));
            Map<String, Object> account = one(c, "SELECT * FROM jma_accounts WHERE id=?", UUID.fromString(str(row, "account_id")));
            return issue(c, account);
        });
    }
    Map<String, Object> authenticate(String authorization) throws Exception {
        if (!authorization.startsWith("Bearer ")) throw new ApiException(401, "Please sign in to continue.");
        String[] pieces = authorization.substring(7).split("\\.");
        if (pieces.length != 3) throw new ApiException(401, "Invalid session. Please sign in again.");
        try {
            if (!MessageDigest.isEqual(hmac(pieces[0] + "." + pieces[1]), Base64.getUrlDecoder().decode(pieces[2])))
                throw new ApiException(401, "Invalid session. Please sign in again.");
            Map<String, Object> claims = object(new String(Base64.getUrlDecoder().decode(pieces[1]), StandardCharsets.UTF_8));
            Map<String, Object> header = object(new String(Base64.getUrlDecoder().decode(pieces[0]), StandardCharsets.UTF_8));
            long expiry = Long.parseLong(str(claims, "exp"));
            if (!"HS256".equals(str(header, "alg")) || !"jobmatchagent".equals(str(claims, "iss")) || expiry <= Instant.now().getEpochSecond())
                throw new ApiException(401, "Your session has expired. Please sign in again.");
            try (Connection c = db.open()) {
                Map<String, Object> account = one(c,
                    "SELECT a.* FROM jma_accounts a JOIN jma_sessions s ON a.id=s.account_id WHERE s.access_id=? AND a.id=? AND s.expires_at>CURRENT_TIMESTAMP",
                    UUID.fromString(str(claims, "jti")), UUID.fromString(str(claims, "sub")));
                if (account == null) throw new ApiException(401, "Your session has expired. Please sign in again.");
                return account;
            }
        } catch (ApiException e) { throw e; }
        catch (Exception e) { throw new ApiException(401, "Invalid session. Please sign in again."); }
    }
    void signOut(Map<String, Object> account) throws Exception {
        try (Connection c = db.open()) { execute(c, "DELETE FROM jma_sessions WHERE account_id=?", id(account)); }
    }
    Map<String, Object> update(Map<String, Object> account, Map<String, Object> body) throws Exception {
        return db.transaction(c -> {
            Map<String, Object> locked = find(c, str(account, "email"), true);
            Map<String, Object> metadata = object(str(locked, "metadata"));
            metadata.put("_neon_modified", true);
            Map<String, Object> data = map(body.get("data"));
            for (String field : List.of("user_name", "full_name")) if (data.containsKey(field)) metadata.put(field, str(data, field));
            execute(c, "UPDATE jma_accounts SET metadata=? WHERE id=?", stringify(metadata), id(locked));
            if (body.containsKey("password")) {
                String password = body.get("password") instanceof String value ? value : ""; password(password);
                execute(c, "UPDATE jma_accounts SET password_hash=? WHERE id=?", BCrypt.hashpw(password, BCrypt.gensalt(12)), id(locked));
                metadata.put("_legacy_password_pending", false);
                execute(c, "UPDATE jma_accounts SET metadata=? WHERE id=?", stringify(metadata), id(locked));
            }
            return publicUser(find(c, str(account, "email"), false));
        });
    }
    Map<String, Object> sendOtp(Map<String, Object> body) throws Exception {
        String email = email(str(body, "email"));
        boolean create = !Boolean.FALSE.equals(body.get("create_user"));
        String name = first(map(body.get("data")), "user_name", "full_name");
        if (usesLegacyEmail()) return db.transaction(c -> {
            Map<String, Object> prior = one(c, "SELECT * FROM jma_otps WHERE email=? FOR UPDATE", email);
            if (prior != null && Plans.instant(str(prior, "sent_at"), Instant.EPOCH).plusSeconds(60).isAfter(Instant.now()))
                throw new ApiException(429, "Please wait a minute before requesting another code.");
            if (!create && find(c, email, false) == null) return of("ok", true);
            legacy.sendOtp(email, name, create);
            execute(c, "DELETE FROM jma_otps WHERE email=?", email);
            execute(c, "INSERT INTO jma_otps(email,code_hash,account_name,create_account,expires_at) VALUES(?,?,?,?,?)", email, "legacy-email", name, create, Instant.now().plusSeconds(600));
            return of("ok", true);
        });
        String code = String.format("%06d", RANDOM.nextInt(1000000));
        return db.transaction(c -> {
            Map<String, Object> prior = one(c, "SELECT * FROM jma_otps WHERE email=? FOR UPDATE", email);
            if (prior != null && Plans.instant(str(prior, "sent_at"), Instant.EPOCH).plusSeconds(60).isAfter(Instant.now()))
                throw new ApiException(429, "Please wait a minute before requesting another code.");
            if (!create && find(c, email, false) == null) return of("ok", true);
            execute(c, "DELETE FROM jma_otps WHERE email=?", email);
            execute(c, "INSERT INTO jma_otps(email,code_hash,account_name,create_account,expires_at) VALUES(?,?,?,?,?)",
                email, otpHash(email, code), name, create, Instant.now().plusSeconds(600));
            sendEmail(email, code);
            return of("ok", true);
        });
    }
    Map<String, Object> verifyOtp(Map<String, Object> body) throws Exception {
        String email = email(str(body, "email"));
        Map<String, Object> result = db.transaction(c -> {
            Map<String, Object> row = one(c, "SELECT * FROM jma_otps WHERE email=? FOR UPDATE", email);
            if (row == null || number(row.get("attempts"), 0) >= 5 || !Plans.instant(str(row, "expires_at"), Instant.EPOCH).isAfter(Instant.now()))
                return of("invalid", true);
            execute(c, "UPDATE jma_otps SET attempts=attempts+1 WHERE email=?", email);
            if (str(row, "code_hash").equals("legacy-email")) {
                try { legacy.verifyOtp(email, str(body, "token")); }
                catch (ApiException error) { if (error.status == 400) return of("invalid", true); throw error; }
            } else if (!MessageDigest.isEqual(str(row, "code_hash").getBytes(StandardCharsets.UTF_8), otpHash(email, str(body, "token")).getBytes(StandardCharsets.UTF_8)))
                return of("invalid", true);
            execute(c, "DELETE FROM jma_otps WHERE email=?", email);
            Map<String, Object> account = find(c, email, true);
            if (account == null) {
                if (!bool(row.get("create_account"))) return of("invalid", true);
                account = create(c, email, str(row, "account_name"), "", "user");
            }
            execute(c, "UPDATE jma_accounts SET last_sign_in_at=? WHERE id=?", Instant.now(), id(account));
            execute(c, "DELETE FROM jma_sessions WHERE account_id=?", id(account));
            return issue(c, account);
        });
        if (bool(result.get("invalid"))) throw new ApiException(400, "The verification code is invalid or has expired.");
        return result;
    }
    boolean usesLegacyEmail() { return (env.getOrDefault("RESEND_API_KEY", "").isBlank() || env.getOrDefault("RESEND_FROM_EMAIL", "").isBlank()) && legacy.available(); }
    void sendEmail(String email, String code) throws Exception {
        String key = env.getOrDefault("RESEND_API_KEY", "");
        String from = env.getOrDefault("RESEND_FROM_EMAIL", "");
        if (key.isBlank() || from.isBlank()) throw new ApiException(503, "Verification email is not configured. Contact the administrator.");
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
            .timeout(Duration.ofSeconds(20)).header("Authorization", "Bearer " + key).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(stringify(of("from", from, "to", List.of(email),
                "subject", "Your Job Match Agent verification code", "text", "Your verification code is " + code + ". It expires in 10 minutes.")))).build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 300) throw new ApiException(503, "Your verification email could not be sent. Please try again later.");
    }
    String otpHash(String email, String code) throws Exception { return Base64.getEncoder().encodeToString(hmac(email + ":" + code)); }
    byte[] hmac(String input) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        return mac.doFinal(input.getBytes(StandardCharsets.UTF_8));
    }
    static String random(int bytes) { byte[] value = new byte[bytes]; RANDOM.nextBytes(value); return Base64.getUrlEncoder().withoutPadding().encodeToString(value); }
    static String digest(String text) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
    static String encode(String text) { return Base64.getUrlEncoder().withoutPadding().encodeToString(text.getBytes(StandardCharsets.UTF_8)); }
}
