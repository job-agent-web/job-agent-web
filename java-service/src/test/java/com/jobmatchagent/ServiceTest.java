package com.jobmatchagent;

import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.sql.Connection;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

class ServiceTest {
    static final String SECRET = "test-session-signing-secret-with-at-least-32-characters";
    static final String ADMIN = "test-admin-secret";
    Main app;
    Database db;
    HttpClient client = HttpClient.newHttpClient();
    String base, token;
    record Response(int status, Map<String, Object> body) {}
    @BeforeEach void start() throws Exception {
        db = new Database("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"); db.migrate();
        Path assets = Files.createTempDirectory("jma-java-test-");
        Files.writeString(assets.resolve("app.html"), "<!DOCTYPE html><html><head></head><body>Existing interface</body></html>");
        Files.writeString(assets.resolve("java-client.js"), "/* test asset */");
        Files.write(assets.resolve("career-hero-blue.png"), new byte[]{(byte)137,80,78,71});
        app = new Main(db, Map.of("SESSION_SIGNING_SECRET", SECRET, "ADMIN_DASHBOARD_SECRET", ADMIN, "ALLOW_LOCAL_HTTP", "true"), assets);
        db.transaction(c -> { app.accounts.create(c, "candidate@example.com", "Candidate", "test-password", "user"); return null; });
        app.start(0); base = "http://localhost:" + app.port();
        token = str(request("POST", "/auth/v1/token?grant_type=password", of("email", "candidate@example.com", "password", "test-password"), "").body(), "access_token");
        assertFalse(token.isBlank());
    }
    @AfterEach void stop() { if (app != null) app.close(); }
    @Test void heroImageIsServedAsAnImageWithoutExposingOtherFiles() throws Exception {
        var image = client.send(HttpRequest.newBuilder(URI.create(base + "/career-hero-blue.png")).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, image.statusCode());
        assertEquals("image/png", image.headers().firstValue("Content-Type").orElse(""));
        assertArrayEquals(new byte[]{(byte)137,80,78,71}, image.body());
        assertEquals(404, request("GET", "/private-image.png", null, "").status());
    }
    Response request(String method, String path, Object body, String bearer) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(30)).header("Content-Type", "application/json");
        if (!bearer.isBlank()) builder.header("Authorization", "Bearer " + bearer);
        var result = client.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(stringify(body))).build(), HttpResponse.BodyHandlers.ofString());
        return new Response(result.statusCode(), object(result.body()));
    }
    Response manage(String action, Map<String, Object> payload) throws Exception {
        var result = client.send(HttpRequest.newBuilder(URI.create(base + "/api/admin-manage-user")).header("Content-Type", "application/json").header("X-Admin-Secret", ADMIN)
            .POST(HttpRequest.BodyPublishers.ofString(stringify(of("action", action, "payload", payload)))).build(), HttpResponse.BodyHandlers.ofString());
        return new Response(result.statusCode(), object(result.body()));
    }
    @Test void rejectsBadPasswordsAndForgedOrRevokedSessions() throws Exception {
        assertEquals(400, request("POST", "/auth/v1/token?grant_type=password", of("email", "candidate@example.com", "password", "wrong-password"), "").status());
        assertEquals(401, request("GET", "/api/current-user-plan", null, token.substring(0, token.length() - 6) + "forged").status());
        assertEquals(200, request("POST", "/auth/v1/logout", of(), token).status());
        assertEquals(401, request("GET", "/api/current-user-plan", null, token).status());
    }
    @Test void refreshTokenRotatesAndOldRefreshCannotBeReused() throws Exception {
        var login = request("POST", "/auth/v1/token?grant_type=password", of("email", "candidate@example.com", "password", "test-password"), "").body();
        String refresh = str(login, "refresh_token");
        assertEquals(200, request("POST", "/auth/v1/token?grant_type=refresh_token", of("refresh_token", refresh), "").status());
        assertEquals(401, request("POST", "/auth/v1/token?grant_type=refresh_token", of("refresh_token", refresh), "").status());
    }
    @Test void adminPlanChangesImmediatelyReachTheUserSnapshot() throws Exception {
        for (var item : Map.of("monthly", 30, "six_month", 183, "yearly", 365).entrySet()) {
            assertEquals(200, manage("setPremium", of("email", "candidate@example.com", "planType", item.getKey())).status());
            var result = request("GET", "/.netlify/functions/current-user-plan", null, token);
            assertEquals(item.getKey(), result.body().get("planType"));
            assertEquals(item.getValue(), result.body().get("daysRemaining"));
        }
        manage("setPremium", of("email", "candidate@example.com", "planType", "lifetime"));
        assertEquals("Unlimited", request("GET", "/api/current-user-plan", null, token).body().get("daysRemaining"));
    }
    @Test void serverRejectsLockedPaneEvenWhenBrowserRequestsItDirectly() throws Exception {
        manage("setPremium", of("email", "candidate@example.com", "planType", "yearly"));
        manage("setPaneLock", of("email", "candidate@example.com", "paneId", "pane2", "mode", "lock"));
        assertEquals(403, request("POST", "/api/generate-cover-letter", of("jobTitle", "Data Analyst", "jobDescription", "Reporting"), token).status());
        manage("setPaneLock", of("email", "candidate@example.com", "paneId", "pane2", "mode", "unlock"));
        assertEquals(503, request("POST", "/api/generate-cover-letter", of("jobTitle", "Data Analyst", "jobDescription", "Reporting"), token).status());
    }
    @Test void expiredConcurrentClaimsAddOnlyOneDay() throws Exception {
        db.transaction(c -> {
            var account = app.accounts.find(c, "candidate@example.com", true);
            var metadata = object(str(account, "metadata")); Plans.set(metadata, "monthly", Instant.now().minus(Duration.ofDays(80)));
            execute(c, "UPDATE jma_accounts SET metadata=? WHERE email=?", stringify(metadata), "candidate@example.com"); return null;
        });
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<Response>> responses = new ArrayList<>();
            for (int i = 0; i < 6; i++) responses.add(pool.submit(() -> request("POST", "/api/claim-weekly-day", of(), token)));
            int successful = 0;
            for (var response : responses) { int status = response.get().status(); assertTrue(status == 200 || status == 409); if (status == 200) successful++; }
            assertEquals(1, successful);
        }
        assertEquals(1, request("GET", "/api/current-user-plan", null, token).body().get("daysRemaining"));
    }
    @Test void callerCannotGrantItselfPaidAccessOrAdminRole() throws Exception {
        request("PUT", "/auth/v1/user", of("data", of("role", "admin", "plan_type", "lifetime", "full_name", "Updated Name")), token);
        request("POST", "/api/record-usage", of("isPaid", true, "email", "other@example.com"), token);
        var snapshot = request("GET", "/api/current-user-plan", null, token).body();
        assertEquals("user", snapshot.get("role")); assertEquals("free", snapshot.get("planType"));
        assertEquals(401, request("GET", "/api/admin-users", null, token).status());
    }
    @Test void invalidOtpAttemptsPersistAndCannotBeBruteForced() throws Exception {
        try (Connection c = db.open()) {
            execute(c, "INSERT INTO jma_otps(email,code_hash,expires_at) VALUES(?,?,?)", "candidate@example.com", app.accounts.otpHash("candidate@example.com", "123456"), Instant.now().plusSeconds(600));
        }
        for (int i = 0; i < 5; i++) assertEquals(400, request("POST", "/auth/v1/verify", of("email", "candidate@example.com", "token", "000000"), "").status());
        assertEquals(400, request("POST", "/auth/v1/verify", of("email", "candidate@example.com", "token", "123456"), "").status());
        try (Connection c = db.open()) { assertEquals(5, one(c, "SELECT attempts FROM jma_otps WHERE email=?", "candidate@example.com").get("attempts")); }
    }
    @Test void successfulOtpIsOneUseAndPreservesAccount() throws Exception {
        try (Connection c = db.open()) {
            execute(c, "INSERT INTO jma_otps(email,code_hash,expires_at) VALUES(?,?,?)", "candidate@example.com", app.accounts.otpHash("candidate@example.com", "123456"), Instant.now().plusSeconds(600));
        }
        var result = request("POST", "/auth/v1/verify", of("email", "candidate@example.com", "token", "123456"), "");
        assertEquals(200, result.status()); assertFalse(str(result.body(), "access_token").isBlank());
        assertEquals(400, request("POST", "/auth/v1/verify", of("email", "candidate@example.com", "token", "123456"), "").status());
    }
    @Test void publicPagePreservesInterfaceAndLoadsNeonBridge() throws Exception {
        var response = client.send(HttpRequest.newBuilder(URI.create(base + "/app.html")).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode()); assertTrue(response.body().contains("java-client.js")); assertTrue(response.body().contains("Existing interface"));
        assertEquals(404, request("GET", "/.env", null, "").status());
        assertEquals(404, request("GET", "/java-service/pom.xml", null, "").status());
    }
    @Test void failedAiRunDoesNotConsumeAnAllowance() throws Exception {
        assertEquals(503, request("POST", "/api/generate-cv", of("data", of("name", "Candidate", "roles", List.of(of("title", "Data Analyst")), "jobDescription", "Reporting")), token).status());
        try (Connection c = db.open()) { assertEquals(0, one(c, "SELECT cv_generations_used FROM jma_usage WHERE email=?", "candidate@example.com").get("cv_generations_used")); }
    }
    @Test void sampleConfigIsStoredOutsideIndividualAccounts() throws Exception {
        var config = of("coverLetterSample1", "Sample one", "coverLetterSample2", "Sample two", "coverLetterSample3", "Sample three");
        assertEquals(200, manage("setCoverLetterGeneratorConfig", of("config", config)).status());
        try (Connection c = db.open()) { assertEquals(config, Admin.settings(c)); }
    }
    @Test void adminPasswordsPreserveWhitespaceAndRejectNonStrings() throws Exception {
        String password = "  exact-password  ";
        assertEquals(200, manage("createUser", of("email", "spaces@example.com", "password", password)).status());
        assertEquals(200, request("POST", "/auth/v1/token", of("email", "spaces@example.com", "password", password), "").status());
        assertEquals(400, request("POST", "/auth/v1/token", of("email", "spaces@example.com", "password", password.strip()), "").status());
        assertEquals(200, manage("changePassword", of("email", "candidate@example.com", "newPassword", password)).status());
        assertEquals(200, request("POST", "/auth/v1/token", of("email", "candidate@example.com", "password", password), "").status());
        assertEquals(400, manage("changePassword", of("email", "candidate@example.com", "password", 123456789)).status());
    }
    @Test void loginRejectsPasswordsBeyondBcryptByteLimit() throws Exception {
        String password = "x".repeat(72);
        assertEquals(200, manage("changePassword", of("email", "candidate@example.com", "password", password)).status());
        assertEquals(200, request("POST", "/auth/v1/token", of("email", "candidate@example.com", "password", password), "").status());
        assertEquals(400, request("POST", "/auth/v1/token", of("email", "candidate@example.com", "password", password + "suffix"), "").status());
    }
    @Test void passwordUpdateRevokesSessionsAndPendingCodes() throws Exception {
        var session = request("POST", "/auth/v1/token", of("email", "candidate@example.com", "password", "test-password"), "").body();
        seedOtp(true);
        assertEquals(200, request("PUT", "/auth/v1/user", of("password", "replacement-password"), token).status());
        assertEquals(401, request("GET", "/auth/v1/user", null, str(session, "access_token")).status());
        assertEquals(401, request("POST", "/auth/v1/token?grant_type=refresh_token", of("refresh_token", session.get("refresh_token")), "").status());
        assertEquals(400, request("POST", "/auth/v1/verify", of("email", "candidate@example.com", "token", "123456"), "").status());
        assertEquals(200, request("POST", "/auth/v1/token", of("email", "candidate@example.com", "password", "replacement-password"), "").status());
    }
    @Test void adminDeleteAndPasswordResetInvalidatePendingCodes() throws Exception {
        seedOtp(true);
        assertEquals(200, manage("changePassword", of("email", "candidate@example.com", "password", "replacement-password")).status());
        assertEquals(400, request("POST", "/auth/v1/verify", of("email", "candidate@example.com", "token", "123456"), "").status());
        seedOtp(true);
        assertEquals(200, manage("deleteUser", of("email", "candidate@example.com")).status());
        assertEquals(400, request("POST", "/auth/v1/verify", of("email", "candidate@example.com", "token", "123456"), "").status());
        try (Connection c = db.open()) { assertNull(app.accounts.find(c, "candidate@example.com", false)); }
    }
    private void seedOtp(boolean create) throws Exception {
        try (Connection c = db.open()) {
            execute(c, "INSERT INTO jma_otps(email,code_hash,create_account,expires_at) VALUES(?,?,?,?)", "candidate@example.com",
                app.accounts.otpHash("candidate@example.com", "123456"), create, Instant.now().plusSeconds(600));
        }
    }
    @Test void malformedJsonIsAClientErrorAndCannotMutateState() throws Exception {
        for (String input : List.of("null", "[]", "{} {}", "{\"action\":\"x\",\"action\":\"y\"}")) {
            var response = client.send(HttpRequest.newBuilder(URI.create(base + "/auth/v1/user"))
                .header("Authorization", "Bearer " + token).PUT(HttpRequest.BodyPublishers.ofString(input)).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(400, response.statusCode(), input);
        }
    }
    @Test void missingUsageRowIsRepairedBeforeQuotaReservation() throws Exception {
        try (Connection c = db.open()) { execute(c, "DELETE FROM jma_usage WHERE email=?", "candidate@example.com"); }
        assertEquals(503, request("POST", "/api/generate-cv", of("data", of("name", "Candidate", "roles", List.of(of("title", "Data Analyst")), "jobDescription", "Reporting")), token).status());
        try (Connection c = db.open()) {
            var usage = one(c, "SELECT * FROM jma_usage WHERE email=?", "candidate@example.com");
            assertNotNull(usage);
            assertEquals(0, usage.get("cv_generations_used"));
        }
    }
    @Test void adminPasskeyAttemptsAreRateLimited() throws Exception {
        for (int i = 0; i < 19; i++) assertEquals(401, request("GET", "/api/admin-users", null, "").status());
        assertEquals(429, request("GET", "/api/admin-users", null, "").status());
    }
    @Test void validAdminRefreshesDoNotExhaustTheSignInLimit() throws Exception {
        for (int i = 0; i < 25; i++) {
            var response = client.send(HttpRequest.newBuilder(URI.create(base + "/api/admin-users"))
                .header("X-Admin-Secret", ADMIN).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
        }
        assertEquals(200, request("POST", "/auth/v1/token", of("email", "candidate@example.com", "password", "test-password"), "").status());
    }
    @Test void providerDiagnosticsRequireAdminAndDoNotExposeSecrets() throws Exception {
        assertEquals(401, request("POST", "/api/ai-diagnostics", of(), token).status());
        var response = client.send(HttpRequest.newBuilder(URI.create(base + "/api/ai-diagnostics"))
            .header("X-Admin-Secret", ADMIN).POST(HttpRequest.BodyPublishers.ofString("{}")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertEquals(5, map(object(response.body()).get("checks")).size());
        assertFalse(response.body().contains(ADMIN));
    }
    @Test void adminCreationRequiresAUsablePasswordAndRoleChangesReachTheSession() throws Exception {
        assertEquals(400, manage("createUser", of("email", "new@example.com")).status());
        assertEquals(400, manage("createUser", of("email", "new@example.com", "password", "short")).status());
        assertEquals(200, manage("createUser", of("email", "new@example.com", "password", "test-password", "name", "New User")).status());
        assertEquals(200, manage("setRole", of("email", "candidate@example.com", "role", "admin")).status());
        var plan = request("GET", "/api/current-user-plan", null, token).body();
        assertEquals("admin", plan.get("role")); assertEquals("Unlimited", plan.get("daysRemaining"));
        assertEquals(200, manage("setRole", of("email", "candidate@example.com", "role", "user")).status());
        assertEquals("user", request("GET", "/api/current-user-plan", null, token).body().get("role"));
    }
    @Test void bulkAdminControlsUpdateAllAccountsAndUsage() throws Exception {
        manage("createUser", of("email", "second@example.com", "password", "test-password"));
        assertEquals(200, manage("setAllPlans", of("isPaid", true)).status());
        assertEquals("lifetime", request("GET", "/api/current-user-plan", null, token).body().get("planType"));
        assertEquals(200, manage("setAllPlans", of("isPaid", false)).status());
        assertEquals("free", request("GET", "/api/current-user-plan", null, token).body().get("planType"));
        manage("adjustUsage", of("email", "second@example.com", "field", "matches", "delta", 1));
        assertEquals(200, manage("resetAllUsage", of()).status());
        try (Connection c = db.open()) {
            assertEquals(0, one(c, "SELECT matches_used FROM jma_usage WHERE email=?", "second@example.com").get("matches_used"));
            assertEquals("free", Plans.type(object(str(app.accounts.find(c, "second@example.com", false), "metadata"))));
        }
    }
    @Test void numericAdminAdjustmentsMustBeExactIntegers() throws Exception {
        for (Object delta : List.of(1.9, "1.5", "NaN", true)) {
            assertEquals(400, manage("adjustDaysRemaining", of("email", "candidate@example.com", "delta", delta)).status());
            assertEquals(400, manage("adjustUsage", of("email", "candidate@example.com", "field", "cv", "delta", delta)).status());
        }
    }
    @Test void refreshAndPasswordResetCannotLeaveAnOldSessionAlive() throws Exception {
        var session = app.accounts.login(of("email", "candidate@example.com", "password", "test-password"));
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var gate = new CountDownLatch(1);
            Future<Map<String, Object>> refreshed = pool.submit(() -> {
                gate.await();
                try { return app.accounts.refresh(str(session, "refresh_token")); }
                catch (ApiException e) { assertEquals(401, e.status); return null; }
            });
            Future<?> reset = pool.submit(() -> {
                gate.await();
                app.admin.action(of("action", "changePassword", "payload", of("email", "candidate@example.com", "password", "reset-password")));
                return null;
            });
            gate.countDown();
            var result = refreshed.get(10, TimeUnit.SECONDS); reset.get(10, TimeUnit.SECONDS);
            if (result != null) assertEquals(401, assertThrows(ApiException.class, () -> app.accounts.authenticate("Bearer " + str(result, "access_token"))).status);
        }
        try (Connection c = db.open()) { assertEquals(0L, one(c, "SELECT COUNT(*) AS total FROM jma_sessions").get("total")); }
    }
    @Test void staleAccountCannotUpdateAReplacementWithTheSameEmail() throws Exception {
        Map<String, Object> stale;
        try (Connection c = db.open()) { stale = app.accounts.find(c, "candidate@example.com", false); }
        manage("deleteUser", of("email", "candidate@example.com"));
        manage("createUser", of("email", "candidate@example.com", "name", "Replacement", "password", "replacement-password"));
        assertEquals(401, assertThrows(ApiException.class, () -> app.accounts.update(stale, of("password", "attacker-password"))).status);
        assertFalse(str(app.accounts.login(of("email", "candidate@example.com", "password", "replacement-password")), "access_token").isBlank());
    }
    @Test void adminUsageAdjustmentsRepairMissingRowsAndAuditSuccessfulChanges() throws Exception {
        try (Connection c = db.open()) { execute(c, "DELETE FROM jma_usage WHERE email=?", "candidate@example.com"); }
        assertEquals(200, manage("adjustUsage", of("email", "candidate@example.com", "field", "cv", "delta", 1)).status());
        try (Connection c = db.open()) {
            assertEquals(1, one(c, "SELECT cv_generations_used FROM jma_usage WHERE email=?", "candidate@example.com").get("cv_generations_used"));
            assertEquals(1L, one(c, "SELECT COUNT(*) AS total FROM jma_audit_log").get("total"));
        }
        assertEquals(400, manage("adjustUsage", of("email", "candidate@example.com", "field", "email", "delta", 1)).status());
        try (Connection c = db.open()) { assertEquals(1L, one(c, "SELECT COUNT(*) AS total FROM jma_audit_log").get("total")); }
        assertEquals(200, manage("resetUsage", of("email", "candidate@example.com")).status());
    }
    @Test void otpAndReservationsMarkImportedAccountsAsLocallyModified() throws Exception {
        seedOtp(true);
        var session = request("POST", "/auth/v1/verify", of("email", "candidate@example.com", "token", "123456"), "").body();
        try (Connection c = db.open()) {
            var account = app.accounts.find(c, "candidate@example.com", false);
            var metadata = object(str(account, "metadata"));
            assertTrue(bool(metadata.get("_neon_modified")));
            assertFalse(map(map(session.get("user")).get("user_metadata")).containsKey("_neon_modified"));
            metadata.put("_neon_modified", false);
            execute(c, "UPDATE jma_accounts SET metadata=? WHERE email=?", stringify(metadata), "candidate@example.com");
        }
        request("POST", "/api/generate-cv", of("data", of("name", "Candidate", "roles", List.of(of("title", "Data Analyst")), "jobDescription", "Reporting")), str(session, "access_token"));
        try (Connection c = db.open()) {
            assertTrue(bool(object(str(app.accounts.find(c, "candidate@example.com", false), "metadata")).get("_neon_modified")));
        }
    }
}
