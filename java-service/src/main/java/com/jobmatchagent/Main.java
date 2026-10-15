package com.jobmatchagent;

import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.net.http.HttpClient;
import java.nio.charset.*;
import java.nio.file.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

public final class Main implements AutoCloseable {
    final Accounts accounts;
    final Admin admin;
    final Ai ai;
    final Search search;
    final LegacyImport legacyImport;
    final Database db;
    final Map<String, String> env;
    private final Path publicDirectory;
    private HttpServer server;
    private ExecutorService executor;
    private final ConcurrentHashMap<String, Deque<Instant>> authAttempts = new ConcurrentHashMap<>();
    private static final int MAX_BODY = 512 * 1024;
    private static final Set<String> PUBLIC_FILES = Set.of("index.html", "auth.html", "auth.js", "app.html", "app.js", "styles.css", "premium.css", "admin.html", "admin-local.html", "admin.js", "cv-generator.js", "ai-session-memory.js", "assistant-ai.js", "career-path-library.js", "hosted-account-sync.js", "uk_sponsors.js", "sponsor_websites.js", "app-icon.svg", "app-install.js", "manifest.webmanifest", "sw.js", "java-client.js");
    private static final Map<String, String> AI_PANES = Map.of("generate-cv", "pane1", "generate-cover-letter", "pane2", "search-results-insights", "pane3", "career-path-planner", "pane7", "generate-interview-questions", "pane8", "chat-with-rex", "pane9", "score-cv", "pane6");
    Main(Database db, Map<String, String> env, Path publicDirectory) throws Exception {
        this.db = db; this.env = env; this.publicDirectory = publicDirectory.toAbsolutePath().normalize();
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
        accounts = new Accounts(db, env, http); admin = new Admin(accounts, env); ai = new Ai(db, env, http); search = new Search(http, this.publicDirectory);
        legacyImport = new LegacyImport(db, env, http);
    }
    public static void main(String[] args) throws Exception {
        if (args.length > 0 && args[0].equals("import-supabase")) { Migration.main(Arrays.copyOfRange(args, 1, args.length)); return; }
        Map<String, String> env = System.getenv();
        Database db = new Database(env.get("DATABASE_URL"));
        if (args.length > 0 && args[0].equals("doctor")) {
            try (var c = db.open()) { one(c, "SELECT 1 AS connected"); }
            new Accounts(db, env, HttpClient.newHttpClient());
            System.out.println("Database connection: OK. Session signing configuration: OK.");
            System.out.println("Admin secret configured: " + !env.getOrDefault("ADMIN_DASHBOARD_SECRET", "").isBlank());
            System.out.println("Verification email configured: " + (!env.getOrDefault("RESEND_API_KEY", "").isBlank() && !env.getOrDefault("RESEND_FROM_EMAIL", "").isBlank()));
            return;
        }
        db.migrate();
        Main app = new Main(db, env, Path.of(env.getOrDefault("PUBLIC_DIR", "public")));
        Runtime.getRuntime().addShutdownHook(new Thread(app::close));
        app.start(Integer.parseInt(env.getOrDefault("PORT", "8080")));
    }
    void start(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 64);
        executor = Executors.newVirtualThreadPerTaskExecutor(); server.setExecutor(executor);
        server.createContext("/", this::handle); server.start();
        System.out.println("Job Match Agent Java service listening on port " + port());
    }
    int port() { return server.getAddress().getPort(); }
    @Override public void close() { if (server != null) server.stop(1); if (executor != null) executor.close(); }
    private void handle(HttpExchange exchange) throws IOException {
        String requestId = UUID.randomUUID().toString();
        try {
            exchange.getResponseHeaders().set("X-Request-Id", requestId);
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            exchange.getResponseHeaders().set("Referrer-Policy", "strict-origin-when-cross-origin");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            if (exchange.getRequestMethod().equals("OPTIONS")) { exchange.sendResponseHeaders(204, -1); return; }
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/healthz")) { send(exchange, 200, of("ok", true, "runtime", "java", "version", "2.0.0")); return; }
            if (path.equals("/readyz")) {
                try (var c = db.open()) { one(c, "SELECT 1 AS ready"); }
                send(exchange, 200, of("ok", true, "database", "postgresql", "runtime", "java")); return;
            }
            if (path.startsWith("/api/") || path.startsWith("/.netlify/functions/") || path.startsWith("/auth/v1/") || path.startsWith("/rest/v1/")) {
                verifyOrigin(exchange);
                Map<String, Object> body = readBody(exchange);
                send(exchange, 200, api(exchange, path, body));
                return;
            }
            staticFile(exchange, path);
        } catch (ApiException e) {
            send(exchange, e.status, of("ok", false, "message", e.getMessage(), "msg", e.getMessage(), "error_description", e.getMessage(), "code", "request_failed"));
        } catch (Exception e) {
            System.err.println("Request " + requestId + " failed: " + e.getClass().getSimpleName());
            send(exchange, 500, of("ok", false, "message", "This request could not be completed. Please try again.", "requestId", requestId));
        } finally { exchange.close(); }
    }
    private void verifyOrigin(HttpExchange exchange) {
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin == null || origin.isBlank()) return;
        String expected = env.getOrDefault("PUBLIC_ORIGIN", "https://jobmatchagent.vercel.app");
        String host = exchange.getRequestHeaders().getFirst("Host");
        if (origin.equals(expected) || origin.equals("https://" + host)) return;
        if ("true".equals(env.get("ALLOW_LOCAL_HTTP")) && (origin.equals("http://" + host))) return;
        throw new ApiException(403, "This request origin is not allowed.");
    }
    private Map<String, Object> readBody(HttpExchange exchange) throws IOException {
        if (Set.of("GET", "HEAD").contains(exchange.getRequestMethod())) return new LinkedHashMap<>();
        byte[] bytes = exchange.getRequestBody().readNBytes(MAX_BODY + 1);
        if (bytes.length > MAX_BODY) throw new ApiException(413, "This request is too large.");
        return bytes.length == 0 ? new LinkedHashMap<>() : object(new String(bytes, StandardCharsets.UTF_8));
    }
    private static void method(HttpExchange exchange, String expected) {
        if (!exchange.getRequestMethod().equals(expected)) throw new ApiException(405, "Method not allowed.");
    }
    private void rateLimit(HttpExchange exchange) {
        String key = exchange.getRemoteAddress().getAddress().getHostAddress();
        // Vercel supplies this header. Local development does not trust caller-supplied IP headers.
        if (env.containsKey("VERCEL")) {
            String forwarded = exchange.getRequestHeaders().getFirst("X-Forwarded-For");
            if (forwarded != null) key = forwarded.split(",")[0].strip();
        }
        if (authAttempts.size() > 10000) authAttempts.entrySet().removeIf(entry -> { synchronized (entry.getValue()) { return entry.getValue().isEmpty() || entry.getValue().getLast().isBefore(Instant.now().minusSeconds(300)); } });
        Deque<Instant> attempts = authAttempts.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (attempts) {
            Instant now = Instant.now();
            while (!attempts.isEmpty() && attempts.getFirst().isBefore(now.minusSeconds(60))) attempts.removeFirst();
            if (attempts.size() >= 20) throw new ApiException(429, "Too many requests. Please wait a minute.");
            attempts.addLast(now);
        }
    }
    private Object api(HttpExchange exchange, String path, Map<String, Object> body) throws Exception {
        String authorization = Optional.ofNullable(exchange.getRequestHeaders().getFirst("Authorization")).orElse("");
        Map<String, String> query = query(exchange.getRequestURI().getRawQuery());
        if (path.startsWith("/auth/v1/")) {
            String action = path.substring("/auth/v1/".length());
            if (!action.equals("user")) rateLimit(exchange);
            switch (action) {
                case "token" -> {
                    method(exchange, "POST");
                    String grant = query.getOrDefault("grant_type", "password");
                    if (grant.equals("refresh_token")) return accounts.refresh(str(body, "refresh_token"));
                    if (!grant.equals("password")) throw new ApiException(400, "Unsupported sign-in method.");
                    return accounts.login(body);
                }
                case "otp", "recover" -> { method(exchange, "POST"); if (action.equals("recover")) body.put("create_user", false); return accounts.sendOtp(body); }
                case "verify" -> { method(exchange, "POST"); return accounts.verifyOtp(body); }
                case "user" -> {
                    Map<String, Object> account = accounts.authenticate(authorization);
                    if (exchange.getRequestMethod().equals("GET")) return accounts.publicUser(account);
                    method(exchange, "PUT"); return accounts.update(account, body);
                }
                case "logout" -> { method(exchange, "POST"); accounts.signOut(accounts.authenticate(authorization)); return of("ok", true); }
                case "settings" -> { method(exchange, "GET"); return of("external", of("email", true), "disable_signup", false); }
                default -> throw new ApiException(404, "Authentication endpoint not found.");
            }
        }
        if (path.equals("/rest/v1/user_usage")) {
            Map<String, Object> account = accounts.authenticate(authorization);
            if (exchange.getRequestMethod().equals("GET")) {
                try (Connection c = db.open()) {
                    Map<String, Object> row = usage(c, account);
                    if (Optional.ofNullable(exchange.getRequestHeaders().getFirst("Accept")).orElse("").contains("vnd.pgrst.object")) return row;
                    return List.of(row);
                }
            }
            method(exchange, "POST"); return recordUsage(account, body);
        }
        String name = path.substring(path.lastIndexOf('/') + 1);
        if (name.equals("migration-control")) {
            method(exchange, "POST");
            String supplied = Optional.ofNullable(exchange.getRequestHeaders().getFirst("X-Migration-Secret")).orElse("");
            String expected = env.getOrDefault("MIGRATION_CONTROL_SECRET", "");
            if (expected.isBlank() || !java.security.MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8)))
                throw new ApiException(401, "Migration control access denied.");
            if (str(body, "action").equals("ai-diagnostics")) return ai.diagnostics();
            return legacyImport.run(bool(body.get("apply")));
        }
        if (name.equals("admin-users") || name.equals("admin-manage-user")) {
            admin.authorize(Optional.ofNullable(exchange.getRequestHeaders().getFirst("X-Admin-Secret")).orElse(""));
            if (name.equals("admin-users")) { method(exchange, "GET"); return admin.users(); }
            method(exchange, "POST"); return admin.action(body);
        }
        if (name.equals("resolve-signin-identifier")) {
            method(exchange, "GET"); rateLimit(exchange);
            String identifier = query.getOrDefault("identifier", "").toLowerCase(Locale.ROOT);
            if (identifier.length() < 2) throw new ApiException(400, "Enter your email or username.");
            try (Connection c = db.open()) {
                for (Map<String, Object> account : Database.query(c, "SELECT email,metadata FROM jma_accounts")) {
                    Map<String, Object> metadata = object(str(account, "metadata"));
                    if (identifier.equals(str(account, "email")) || identifier.equals(str(metadata, "user_name").toLowerCase(Locale.ROOT)) || identifier.equals(str(metadata, "full_name").toLowerCase(Locale.ROOT)))
                        return of("ok", true, "email", account.get("email"));
                }
            }
            return of("ok", false, "message", "No account matched that email or username.");
        }
        if (name.equals("ai-health")) { method(exchange, "GET"); return ai.run(name, body); }
        if (name.equals("ai-smoke-test")) {
            method(exchange, "GET"); admin.authorize(Optional.ofNullable(exchange.getRequestHeaders().getFirst("X-Admin-Secret")).orElse("")); return ai.run(name, body);
        }
        Map<String, Object> account = accounts.authenticate(authorization);
        if (name.equals("current-user-plan")) { method(exchange, "GET"); return Plans.snapshot(account); }
        if (name.equals("company-website")) { method(exchange, "GET"); return search.website(query.getOrDefault("company", "")); }
        if (name.equals("nhs-values")) { method(exchange, "GET"); return search.values(query.getOrDefault("company", "")); }
        method(exchange, "POST");
        if (name.equals("claim-weekly-day")) {
            return db.transaction(c -> {
                Map<String, Object> locked = accounts.find(c, str(account, "email"), true);
                Map<String, Object> metadata = object(str(locked, "metadata"));
                Plans.claim(metadata, str(locked, "created_at"), Instant.now());
                metadata.put("_neon_modified", true);
                execute(c, "UPDATE jma_accounts SET metadata=? WHERE id=?", stringify(metadata), Accounts.id(locked));
                Map<String, Object> result = Plans.snapshot(accounts.find(c, str(account, "email"), false));
                result.put("message", "One free day has been added to your balance."); return result;
            });
        }
        if (name.equals("record-usage")) return recordUsage(account, body);
        if (name.equals("track-ai-usage")) return of("ok", true);
        if (AI_PANES.containsKey(name)) {
            String pane = AI_PANES.get(name); reserve(account, pane, name);
            try {
                Map<String, Object> result = ai.run(name, body);
                saveAiUsage(account, pane, result);
                return result;
            } catch (Exception e) { release(account, name); throw e; }
        }
        if (Set.of("find-sponsored-jobs", "run-scraper").contains(name)) {
            requirePane(account, "pane4"); return search.jobs(body);
        }
        throw new ApiException(404, "This endpoint was not found.");
    }
    private Map<String, Object> recordUsage(Map<String, Object> account, Map<String, Object> body) throws Exception {
        // Counters and entitlements are authoritative on the server; browser snapshots cannot change them.
        try (var c = db.open()) { return of("ok", true, "usage", usage(c, account)); }
    }
    private Map<String, Object> usage(Connection c, Map<String, Object> account) throws Exception {
        Map<String, Object> row = one(c, "SELECT * FROM jma_usage WHERE email=?", account.get("email"));
        if (row == null) row = of("email", account.get("email"), "matches_used", 0, "searches_used", 0, "cv_generations_used", 0);
        Map<String, Object> snapshot = Plans.snapshot(account);
        row.put("user_name", first(object(str(account, "metadata")), "user_name", "full_name"));
        row.put("is_paid", snapshot.get("paid")); row.put("plan_type", snapshot.get("planType"));
        row.put("subscription_started_at", snapshot.get("subscriptionStartedAt")); row.put("user_role", snapshot.get("role"));
        row.put("locked_panes", snapshot.get("lockedPanes")); row.put("unlocked_panes", snapshot.get("unlockedPanes"));
        return row;
    }
    private void requirePane(Map<String, Object> account, String pane) {
        if (!Plans.allowed(object(str(account, "metadata")), str(account, "created_at"), pane, Instant.now()))
            throw new ApiException(403, "This pane is locked on your account. Choose a plan to continue.");
    }
    private static String counter(String feature) { return feature.equals("generate-cv") ? "cv_generations_used" : feature.equals("generate-cover-letter") ? "matches_used" : ""; }
    private void reserve(Map<String, Object> account, String pane, String feature) throws Exception {
        db.transaction(c -> {
            Map<String, Object> fresh = accounts.find(c, str(account, "email"), true); requirePane(fresh, pane);
            String counter = counter(feature);
            if (!counter.isEmpty()) {
                Map<String, Object> row = usage(c, fresh);
                if (!Plans.admin(object(str(fresh, "metadata"))) && Plans.type(object(str(fresh, "metadata"))).equals("free") && number(row.get(counter), 0) >= 5)
                    throw new ApiException(403, "Your free generation allowance is used up. Choose a plan to continue.");
                execute(c, "UPDATE jma_usage SET " + counter + "=" + counter + "+1 WHERE email=?", fresh.get("email"));
            }
            return null;
        });
    }
    private void release(Map<String, Object> account, String feature) throws Exception {
        String field = counter(feature);
        if (!field.isEmpty()) try (Connection c = db.open()) { execute(c, "UPDATE jma_usage SET " + field + "=GREATEST(0," + field + "-1) WHERE email=?", account.get("email")); }
    }
    private void saveAiUsage(Map<String, Object> account, String pane, Map<String, Object> result) throws Exception {
        db.transaction(c -> {
            Map<String, Object> fresh = accounts.find(c, str(account, "email"), true);
            Map<String, Object> metadata = object(str(fresh, "metadata"));
            metadata.put("ai_last_pane", pane); metadata.put("ai_last_pane_label", "Pane " + pane.substring(4));
            metadata.put("ai_last_model", str(result, "model")); metadata.put("ai_last_source", str(result, "provider"));
            metadata.put("ai_last_route", str(result, "provider")); metadata.put("ai_last_used_at", Instant.now().toString());
            execute(c, "UPDATE jma_accounts SET metadata=? WHERE id=?", stringify(metadata), Accounts.id(fresh));
            return null;
        });
    }
    private void staticFile(HttpExchange exchange, String rawPath) throws Exception {
        if (!Set.of("GET", "HEAD").contains(exchange.getRequestMethod())) throw new ApiException(405, "Method not allowed.");
        String path = switch (rawPath) { case "/", "/index" -> "index.html"; case "/app", "/app/" -> "app.html"; case "/admin", "/admin/", "/admin-local", "/admin-local/" -> "admin.html"; default -> rawPath.startsWith("/") ? rawPath.substring(1) : rawPath; };
        if (!PUBLIC_FILES.contains(path)) throw new ApiException(404, "Page not found.");
        Path file = publicDirectory.resolve(path).normalize();
        if (!file.startsWith(publicDirectory) || !Files.isRegularFile(file)) throw new ApiException(404, "Page not found.");
        byte[] bytes = Files.readAllBytes(file);
        String type = path.endsWith(".html") ? "text/html; charset=utf-8" : path.endsWith(".css") ? "text/css; charset=utf-8" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".webmanifest") ? "application/manifest+json" : "application/javascript; charset=utf-8";
        if (path.endsWith(".html")) {
            String html = new String(bytes, StandardCharsets.UTF_8);
            html = html.replaceFirst("(?i)<head>", "<head><script src=\"/java-client.js?v=20261015\"></script>");
            bytes = html.getBytes(StandardCharsets.UTF_8);
        }
        exchange.getResponseHeaders().set("Content-Type", type);
        if (exchange.getRequestMethod().equals("HEAD")) { exchange.sendResponseHeaders(200, -1); return; }
        exchange.sendResponseHeaders(200, bytes.length); exchange.getResponseBody().write(bytes);
    }
    private static void send(HttpExchange exchange, int status, Object body) throws IOException {
        byte[] bytes = stringify(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes);
    }
    static Map<String, String> query(String raw) {
        Map<String, String> result = new LinkedHashMap<>();
        if (raw != null) for (String part : raw.split("&")) { String[] pair = part.split("=", 2); result.put(URLDecoder.decode(pair[0], StandardCharsets.UTF_8), pair.length == 2 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : ""); }
        return result;
    }
}
