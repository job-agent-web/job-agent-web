package com.jobmatchagent;

import java.net.URI;
import java.net.http.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

/** Imports through the existing private service key without exporting secrets or account data. */
final class LegacyImport {
    final Database db;
    final Map<String, String> env;
    final HttpClient http;
    LegacyImport(Database db, Map<String, String> env, HttpClient http) { this.db = db; this.env = env; this.http = http; }
    Object get(String path) throws Exception {
        String base = env.getOrDefault("SUPABASE_URL", "").strip().replaceAll("/+$", "");
        String key = env.getOrDefault("SUPABASE_SERVICE_ROLE_KEY", "").strip();
        if (!base.startsWith("https://") || key.isBlank()) throw new ApiException(503, "Legacy import is not configured.");
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(25))
            .header("apikey", key).header("Authorization", "Bearer " + key).GET().build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 300) throw new ApiException(502, "The previous account service could not be read (status " + response.statusCode() + ").");
        return parse(response.body());
    }
    Map<String, Object> run(boolean apply) throws Exception {
        List<Map<String, Object>> users = new ArrayList<>();
        for (int page = 1; page <= 10000; page++) {
            List<Object> batch = list(map(get("/auth/v1/admin/users?page=" + page + "&per_page=200")).get("users"));
            batch.stream().map(Json::map).filter(user -> !str(user, "email").isBlank()).forEach(users::add);
            if (batch.size() < 200) break;
            if (page == 10000) throw new ApiException(500, "Account pagination did not finish. No import was applied.");
        }
        Map<String, Map<String, Object>> usage = new HashMap<>();
        for (int offset = 0; offset < 1000000; offset += 1000) {
            List<Object> batch = list(get("/rest/v1/user_usage?select=*&order=email&limit=1000&offset=" + offset));
            for (Object item : batch) { Map<String, Object> row = map(item); usage.put(str(row, "email").toLowerCase(Locale.ROOT), row); }
            if (batch.size() < 1000) break;
        }
        if (!apply) {
            try (Connection c = db.open()) {
                return of("ok", true, "sourceAccounts", users.size(), "sourceUsageRows", usage.size(),
                    "destinationAccounts", number(one(c, "SELECT COUNT(*) AS total FROM jma_accounts").get("total"), 0),
                    "passwordHashesAvailable", users.stream().anyMatch(user -> !str(user, "encrypted_password").isBlank()), "applied", false);
            }
        }
        return db.transaction(c -> {
            one(c, "SELECT pg_advisory_xact_lock(713087415) AS migration_lock");
            int inserted = 0, updated = 0, skipped = 0;
            for (Map<String, Object> user : users) {
                String email = str(user, "email").toLowerCase(Locale.ROOT);
                Map<String, Object> existing = one(c, "SELECT * FROM jma_accounts WHERE email=? FOR UPDATE", email);
                Map<String, Object> metadata = new LinkedHashMap<>(map(user.get("user_metadata")));
                if (existing != null) {
                    Map<String, Object> local = object(str(existing, "metadata"));
                    if (!bool(local.get("_legacy_imported")) || bool(local.get("_neon_modified")) || !bool(local.get("_legacy_password_pending"))) { skipped++; continue; }
                }
                Map<String, Object> row = usage.getOrDefault(email, Map.of());
                for (String field : List.of("plan_type", "subscription_started_at", "locked_panes", "unlocked_panes", "weekly_free_day_claimed_at", "weekly_claim_plan_type", "weekly_bonus_days"))
                    if (!metadata.containsKey(field) && row.get(field) != null) metadata.put(field, row.get(field));
                if (first(metadata, "plan_type", "planType", "plan", "subscription_plan", "subscriptionPlan").isBlank()) metadata.put("plan_type", bool(row.get("is_paid")) ? "lifetime" : "free");
                if (str(metadata, "role").isBlank()) metadata.put("role", str(row, "user_role").isBlank() ? "user" : str(row, "user_role"));
                String hash = str(user, "encrypted_password");
                metadata.put("_legacy_imported", true); metadata.put("_legacy_password_pending", hash.isBlank());
                metadata.put("_legacy_snapshot_at", Instant.now().toString());
                metadata.put("_neon_modified", false);
                Instant created = Plans.instant(str(user, "created_at"), Instant.now());
                Instant lastSignIn = str(user, "last_sign_in_at").isBlank() ? null : Plans.instant(str(user, "last_sign_in_at"), created);
                if (existing == null) {
                    execute(c, "INSERT INTO jma_accounts(id,email,password_hash,metadata,created_at,last_sign_in_at) VALUES(?,?,?,?,?,?)",
                        UUID.fromString(str(user, "id")), email, hash.isBlank() ? null : hash, stringify(metadata), created, lastSignIn);
                    execute(c, "INSERT INTO jma_usage(email,matches_used,searches_used,cv_generations_used) VALUES(?,?,?,?)", email,
                        Math.max(0, number(row.get("matches_used"), 0)), Math.max(0, number(row.get("searches_used"), 0)), Math.max(0, number(row.get("cv_generations_used"), 0)));
                    inserted++;
                } else {
                    execute(c, "UPDATE jma_accounts SET metadata=? WHERE email=?", stringify(metadata), email);
                    execute(c, "UPDATE jma_usage SET matches_used=?,searches_used=?,cv_generations_used=? WHERE email=?",
                        Math.max(0, number(row.get("matches_used"), 0)), Math.max(0, number(row.get("searches_used"), 0)), Math.max(0, number(row.get("cv_generations_used"), 0)), email);
                    updated++;
                }
                Map<String, Object> samples = map(metadata.get("cover_letter_generator_config"));
                if (!samples.isEmpty() && one(c, "SELECT setting_key FROM jma_settings WHERE setting_key=?", "cover_letter_generator_config") == null)
                    execute(c, "INSERT INTO jma_settings(setting_key,setting_value) VALUES(?,?)", "cover_letter_generator_config", stringify(samples));
            }
            int total = number(one(c, "SELECT COUNT(*) AS total FROM jma_accounts").get("total"), 0);
            return of("ok", true, "sourceAccounts", users.size(), "sourceUsageRows", usage.size(), "inserted", inserted, "refreshed", updated, "preservedNeonAccounts", skipped, "destinationAccounts", total, "applied", true);
        });
    }
}
