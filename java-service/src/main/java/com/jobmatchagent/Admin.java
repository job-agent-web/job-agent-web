package com.jobmatchagent;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

final class Admin {
    private final Accounts accounts;
    private final String secret;
    Admin(Accounts accounts, Map<String, String> env) {
        this.accounts = accounts;
        secret = env.getOrDefault("ADMIN_DASHBOARD_SECRET", "");
    }
    void authorize(String supplied) {
        if (secret.isEmpty()) throw new ApiException(503, "Admin access has not been configured.");
        if (!MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8)))
            throw new ApiException(401, "The admin passkey is incorrect.");
    }
    Map<String, Object> users() throws Exception {
        try (Connection c = accounts.db.open()) {
            List<Map<String, Object>> result = new ArrayList<>();
            for (Map<String, Object> account : query(c, "SELECT a.*,u.matches_used,u.searches_used,u.cv_generations_used FROM jma_accounts a LEFT JOIN jma_usage u ON a.email=u.email ORDER BY a.created_at DESC")) {
                Map<String, Object> metadata = object(str(account, "metadata"));
                Map<String, Object> snapshot = Plans.snapshot(account);
                boolean paid = bool(snapshot.get("paid"));
                String plan = Plans.type(metadata);
                String label = switch (plan) { case "monthly" -> "1 Month"; case "six_month" -> "6 Months"; case "yearly" -> "12 Months"; case "lifetime" -> "Lifetime"; default -> "Free"; };
                Map<String, Object> row = of("email", account.get("email"), "user_name", first(metadata, "user_name", "full_name"),
                    "created_at", account.get("created_at"), "last_sign_in_at", account.getOrDefault("last_sign_in_at", ""),
                    "matches_left", paid ? "Unlimited" : Math.max(0, 5 - number(account.get("matches_used"), 0)),
                    "searches_left", paid ? "Unlimited" : Math.max(0, 15 - number(account.get("searches_used"), 0)),
                    "cv_left", paid ? "Unlimited" : Math.max(0, 5 - number(account.get("cv_generations_used"), 0)),
                    "plan", label, "subscription", label, "plan_type", plan, "is_paid", paid,
                    "subscription_started_at", snapshot.get("subscriptionStartedAt"), "days_remaining", snapshot.get("daysRemaining"),
                    "role", snapshot.get("role"), "locked_panes", snapshot.get("lockedPanes"), "unlocked_panes", snapshot.get("unlockedPanes"));
                for (String key : List.of("pane", "pane_label", "route", "model", "source", "note", "used_at"))
                    row.put("ai_" + (key.equals("used_at") ? "last_used_at" : key), str(metadata, "ai_last_" + key));
                result.add(row);
            }
            return of("ok", true, "users", result, "generator_config", settings(c));
        }
    }
    static Map<String, Object> settings(Connection c) throws SQLException {
        Map<String, Object> row = one(c, "SELECT setting_value FROM jma_settings WHERE setting_key=?", "cover_letter_generator_config");
        return row == null ? of("coverLetterSample1", "", "coverLetterSample2", "", "coverLetterSample3", "") : object(str(row, "setting_value"));
    }
    Map<String, Object> action(Map<String, Object> body) throws Exception {
        String action = str(body, "action");
        Map<String, Object> payload = map(body.get("payload"));
        return accounts.db.transaction(c -> {
            if (action.equals("setCoverLetterGeneratorConfig")) {
                Map<String, Object> source = map(payload.getOrDefault("generatorConfig", payload.getOrDefault("config", payload)));
                Map<String, Object> config = new LinkedHashMap<>();
                for (int i = 1; i <= 3; i++) {
                    String text = str(source, "coverLetterSample" + i);
                    if (text.length() > 50000) throw new ApiException(400, "Each cover-letter sample must be shorter than 50,000 characters.");
                    config.put("coverLetterSample" + i, text);
                }
                execute(c, "DELETE FROM jma_settings WHERE setting_key=?", "cover_letter_generator_config");
                execute(c, "INSERT INTO jma_settings(setting_key,setting_value) VALUES(?,?)", "cover_letter_generator_config", stringify(config));
                audit(c, action, "");
                return of("ok", true, "generator_config", config, "message", "Cover-letter samples saved.");
            }
            if (Set.of("resetAllUsage", "setAllPlans").contains(action)) {
                for (Map<String, Object> row : query(c, "SELECT email FROM jma_accounts ORDER BY email FOR UPDATE"))
                    change(c, action.equals("resetAllUsage") ? "resetUsage" : bool(payload.get("isPaid")) ? "setPremium" : "setFree",
                        of("email", row.get("email"), "planType", "lifetime"));
                audit(c, action, "*");
                return of("ok", true, "message", "Accounts updated.");
            }
            if (action.equals("createUser")) {
                String role = role(str(payload, "role"));
                Map<String, Object> account = accounts.create(c, str(payload, "email"), str(payload, "name"), str(payload, "password"), role);
                audit(c, action, str(account, "email"));
                return of("ok", true, "message", "Account created.", "user", accounts.publicUser(account));
            }
            return change(c, action, payload);
        });
    }
    private Map<String, Object> change(Connection c, String action, Map<String, Object> payload) throws Exception {
        String email = Accounts.email(str(payload, "email"));
        Map<String, Object> account = accounts.find(c, email, true);
        if (account == null) throw new ApiException(404, "This account could not be found.");
        Map<String, Object> metadata = object(str(account, "metadata"));
        metadata.put("_neon_modified", true);
        switch (action) {
            case "deleteUser" -> execute(c, "DELETE FROM jma_accounts WHERE email=?", email);
            case "changePassword" -> {
                String password = first(payload, "password", "newPassword"); Accounts.password(password);
                execute(c, "UPDATE jma_accounts SET password_hash=? WHERE email=?", org.mindrot.jbcrypt.BCrypt.hashpw(password, org.mindrot.jbcrypt.BCrypt.gensalt(12)), email);
                metadata.put("_legacy_password_pending", false);
                execute(c, "DELETE FROM jma_sessions WHERE account_id=?", Accounts.id(account));
            }
            case "setPremium", "setFree" -> Plans.set(metadata, action.equals("setFree") ? "free" : str(payload, "planType").isEmpty() ? "monthly" : str(payload, "planType"), Instant.now());
            case "setRole" -> {
                String role = role(str(payload, "role")); metadata.put("role", role);
                if (!role.equals("user")) Plans.set(metadata, "lifetime", Instant.now());
            }
            case "adjustDaysRemaining" -> Plans.adjust(metadata, str(account, "created_at"), number(payload.get("delta"), 0), Instant.now());
            case "resetWeeklyFreeDayClaim" -> { metadata.put("weekly_free_day_claimed_at", ""); metadata.put("weeklyFreeDayClaimedAt", ""); }
            case "setPaneLock" -> {
                String pane = first(payload, "paneId", "pane_id", "pane"); List<String> normalized = Plans.panes(pane);
                if (normalized.size() != 1) throw new ApiException(400, "Choose a valid pane.");
                pane = normalized.getFirst();
                List<String> locked = Plans.panes(metadata.get("locked_panes")), unlocked = Plans.panes(metadata.get("unlocked_panes"));
                locked.remove(pane); unlocked.remove(pane);
                if ("lock".equals(str(payload, "mode")) || bool(payload.get("locked"))) locked.add(pane); else unlocked.add(pane);
                metadata.put("locked_panes", locked); metadata.put("unlocked_panes", unlocked);
            }
            case "resetUsage" -> execute(c, "UPDATE jma_usage SET matches_used=0,searches_used=0,cv_generations_used=0 WHERE email=?", email);
            case "adjustUsage" -> {
                String field = switch (str(payload, "field")) {
                    case "matches", "matches_used", "matchesUsed" -> "matches_used";
                    case "searches", "searches_used", "searchesUsed" -> "searches_used";
                    case "cv", "cv_generations_used", "cvGenerationsUsed" -> "cv_generations_used";
                    default -> throw new ApiException(400, "Choose a valid usage counter.");
                };
                int delta = number(payload.get("delta"), 0);
                if (Math.abs(delta) != 1) throw new ApiException(400, "Use a one-step usage adjustment.");
                execute(c, "UPDATE jma_usage SET " + field + "=GREATEST(0," + field + "+?) WHERE email=?", delta, email);
            }
            case "pushUpdate" -> { }
            default -> throw new ApiException(400, "This admin action is not supported.");
        }
        if (!action.equals("deleteUser")) execute(c, "UPDATE jma_accounts SET metadata=? WHERE email=?", stringify(metadata), email);
        audit(c, action, email);
        Map<String, Object> result = action.equals("deleteUser") ? of("ok", true) : Plans.snapshot(accounts.find(c, email, false));
        result.put("message", "Account updated.");
        return result;
    }
    static String role(String value) {
        if (value.isEmpty()) return "user";
        if (!Set.of("user", "admin", "super_admin").contains(value)) throw new ApiException(400, "Choose a valid account role.");
        return value;
    }
    private void audit(Connection c, String action, String email) throws SQLException {
        execute(c, "INSERT INTO jma_audit_log(id,actor,action,account_email) VALUES(?,?,?,?)", UUID.randomUUID(), "admin", action, email);
    }
}
