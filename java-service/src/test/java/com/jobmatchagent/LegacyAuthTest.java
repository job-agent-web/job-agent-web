package com.jobmatchagent;

import java.net.http.HttpClient;
import java.sql.Connection;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

class LegacyAuthTest {
    @Test void firstSignInMigratesPasswordAndLaterSignInsUseOnlyNeon() throws Exception {
        Database db = new Database("jdbc:h2:mem:legacy-login-" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"); db.migrate();
        AiTest.FakeClient client = new AiTest.FakeClient(new AiTest.Reply(200, of("user", of("email", "existing@example.com"), "access_token", "legacy-session")));
        Accounts accounts = new Accounts(db, Map.of("SESSION_SIGNING_SECRET", ServiceTest.SECRET, "SUPABASE_URL", "https://legacy.example.com", "SUPABASE_ANON_KEY", "test-only"), client);
        db.transaction(c -> {
            var account = accounts.create(c, "existing@example.com", "Existing", "", "user");
            var metadata = object(str(account, "metadata")); metadata.put("_legacy_password_pending", true);
            execute(c, "UPDATE jma_accounts SET metadata=? WHERE email=?", stringify(metadata), "existing@example.com"); return null;
        });
        assertFalse(str(accounts.login(of("email", "existing@example.com", "password", "existing-password")), "access_token").isBlank());
        assertFalse(str(accounts.login(of("email", "existing@example.com", "password", "existing-password")), "access_token").isBlank());
        assertEquals(1, client.requests.size());
        try (Connection c = db.open()) {
            var account = accounts.find(c, "existing@example.com", false);
            assertFalse(str(account, "password_hash").isBlank());
            assertFalse(bool(object(str(account, "metadata")).get("_legacy_password_pending")));
        }
    }
    @Test void invalidLegacyPasswordDoesNotReplaceNeonPassword() throws Exception {
        Database db = new Database("jdbc:h2:mem:legacy-invalid-" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"); db.migrate();
        AiTest.FakeClient client = new AiTest.FakeClient(new AiTest.Reply(400, of("message", "Invalid login")));
        Accounts accounts = new Accounts(db, Map.of("SESSION_SIGNING_SECRET", ServiceTest.SECRET, "SUPABASE_URL", "https://legacy.example.com", "SUPABASE_ANON_KEY", "test-only"), client);
        db.transaction(c -> {
            accounts.create(c, "existing@example.com", "Existing", "", "user");
            execute(c, "UPDATE jma_accounts SET metadata=? WHERE email=?", stringify(of("role", "user", "plan_type", "free", "_legacy_password_pending", true)), "existing@example.com"); return null;
        });
        assertThrows(ApiException.class, () -> accounts.login(of("email", "existing@example.com", "password", "incorrect-password")));
        try (Connection c = db.open()) { assertTrue(str(accounts.find(c, "existing@example.com", false), "password_hash").isBlank()); }
    }
}
