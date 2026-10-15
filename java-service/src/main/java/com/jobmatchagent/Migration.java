package com.jobmatchagent;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

/** Read-only Supabase export; additive Neon import, with a dry run as the default. */
public final class Migration {
    private Migration() {}
    public static void main(String[] args) throws Exception {
        boolean apply = Arrays.asList(args).contains("--apply");
        Database source = new Database(System.getenv("LEGACY_DATABASE_URL"));
        Database destination = new Database(System.getenv("DATABASE_URL"));
        transfer(source, destination, apply);
    }
    static int transfer(Database source, Database destination, boolean apply) throws Exception {
        List<Map<String, Object>> users;
        Map<String, Map<String, Object>> usage = new HashMap<>();
        try (Connection legacy = source.open()) {
            legacy.setReadOnly(true);
            users = query(legacy, "SELECT id,email,encrypted_password,raw_user_meta_data,created_at,last_sign_in_at FROM auth.users WHERE email IS NOT NULL ORDER BY created_at");
            for (Map<String, Object> row : query(legacy, "SELECT * FROM public.user_usage")) usage.put(str(row, "email").toLowerCase(Locale.ROOT), row);
        }
        if (!apply) {
            System.out.println("Dry run: " + users.size() + " accounts and " + usage.size() + " usage records found. No changes made. Use --apply after connecting a Neon staging database.");
            return 0;
        }
        destination.migrate();
        int imported = destination.transaction(c -> {
            int count = 0;
            for (Map<String, Object> user : users) {
                String email = str(user, "email").toLowerCase(Locale.ROOT);
                if (one(c, "SELECT id FROM jma_accounts WHERE email=?", email) != null) continue;
                Map<String, Object> row = usage.getOrDefault(email, Map.of());
                Map<String, Object> metadata = object(str(user, "raw_user_meta_data").isBlank() ? "{}" : str(user, "raw_user_meta_data"));
                if (first(metadata, "plan_type", "planType", "plan", "subscription_plan", "subscriptionPlan").isBlank()) metadata.put("plan_type", str(row, "plan_type").isBlank() ? "free" : str(row, "plan_type"));
                if (first(metadata, "subscription_started_at", "subscriptionStartedAt").isBlank() && !str(row, "subscription_started_at").isBlank()) metadata.put("subscription_started_at", str(row, "subscription_started_at"));
                if (str(metadata, "role").isBlank()) metadata.put("role", str(row, "user_role").isBlank() ? "user" : str(row, "user_role"));
                for (String field : List.of("locked_panes", "unlocked_panes")) if (!metadata.containsKey(field) && row.get(field) != null) {
                    Object value = row.get(field);
                    if (value instanceof java.sql.Array array) value = Arrays.asList((Object[]) array.getArray());
                    metadata.put(field, value instanceof String text && text.startsWith("[") ? parse(text) : value);
                }
                execute(c, "INSERT INTO jma_accounts(id,email,password_hash,metadata,created_at,last_sign_in_at) VALUES(?,?,?,?,?,?)",
                    UUID.fromString(str(user, "id")), email, user.get("encrypted_password"), stringify(metadata),
                    Plans.instant(str(user, "created_at"), Instant.now()), str(user, "last_sign_in_at").isBlank() ? null : Instant.parse(str(user, "last_sign_in_at")));
                execute(c, "INSERT INTO jma_usage(email,matches_used,searches_used,cv_generations_used) VALUES(?,?,?,?)", email,
                    Math.max(0, number(row.get("matches_used"), 0)), Math.max(0, number(row.get("searches_used"), 0)), Math.max(0, number(row.get("cv_generations_used"), 0)));
                Map<String, Object> samples = map(metadata.get("cover_letter_generator_config"));
                if (!samples.isEmpty() && one(c, "SELECT setting_key FROM jma_settings WHERE setting_key=?", "cover_letter_generator_config") == null)
                    execute(c, "INSERT INTO jma_settings(setting_key,setting_value) VALUES(?,?)", "cover_letter_generator_config", stringify(samples));
                count++;
            }
            return count;
        });
        System.out.println("Imported " + imported + " accounts into Neon. Existing destination accounts were left unchanged. Supabase was read-only throughout.");
        return imported;
    }
}
