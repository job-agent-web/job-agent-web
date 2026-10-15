package com.jobmatchagent;

import java.net.http.HttpClient;
import java.sql.Connection;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mindrot.jbcrypt.BCrypt;
import static org.junit.jupiter.api.Assertions.*;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

class MigrationTest {
    @Test void dryRunIsReadOnlyAndApplyPreservesPasswordsPlansAndUsage() throws Exception {
        Database source = new Database("jdbc:h2:mem:legacy-" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
        Database destination = new Database("jdbc:h2:mem:neon-" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
        UUID userId = UUID.randomUUID();
        String hash = BCrypt.hashpw("existing-password", BCrypt.gensalt(10));
        var metadata = of("user_name", "Existing User", "plan_type", "6 months", "role", "user", "subscription_started_at", Instant.now().toString(),
            "locked_panes", List.of("pane8"), "cover_letter_generator_config", of("coverLetterSample1", "Existing master letter"));
        try (Connection c = source.open()) {
            execute(c, "CREATE SCHEMA auth");
            execute(c, "CREATE TABLE auth.users(id UUID,email TEXT,encrypted_password TEXT,raw_user_meta_data TEXT,created_at TIMESTAMP WITH TIME ZONE,last_sign_in_at TIMESTAMP WITH TIME ZONE)");
            execute(c, "CREATE TABLE public.user_usage(email TEXT,matches_used INT,searches_used INT,cv_generations_used INT)");
            execute(c, "INSERT INTO auth.users VALUES(?,?,?,?,?,?)", userId, "existing@example.com", hash, stringify(metadata), Instant.now(), Instant.now());
            execute(c, "INSERT INTO public.user_usage VALUES(?,?,?,?)", "existing@example.com", 2, 3, 4);
        }
        assertEquals(0, Migration.transfer(source, destination, false));
        destination.migrate();
        try (Connection c = destination.open()) { assertEquals(0L, one(c, "SELECT COUNT(*) AS total FROM jma_accounts").get("total")); }
        assertEquals(1, Migration.transfer(source, destination, true));
        Accounts accounts = new Accounts(destination, Map.of("SESSION_SIGNING_SECRET", ServiceTest.SECRET), HttpClient.newHttpClient());
        var login = accounts.login(of("email", "existing@example.com", "password", "existing-password"));
        assertFalse(str(login, "access_token").isBlank());
        try (Connection c = destination.open()) {
            var account = accounts.find(c, "existing@example.com", false);
            assertEquals(userId.toString(), account.get("id")); assertEquals(hash, account.get("password_hash"));
            assertEquals("six_month", Plans.snapshot(account).get("planType"));
            assertEquals(List.of("pane8"), Plans.snapshot(account).get("lockedPanes"));
            assertEquals(4, one(c, "SELECT * FROM jma_usage WHERE email=?", "existing@example.com").get("cv_generations_used"));
            assertEquals("Existing master letter", Admin.settings(c).get("coverLetterSample1"));
        }
        assertEquals(0, Migration.transfer(source, destination, true));
        try (Connection c = source.open()) { assertEquals(hash, one(c, "SELECT encrypted_password FROM auth.users").get("encrypted_password")); }
    }
}
