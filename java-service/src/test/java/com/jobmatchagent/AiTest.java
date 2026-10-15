package com.jobmatchagent;

import java.io.IOException;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static com.jobmatchagent.Json.*;

class AiTest {
    @Test void bareCloudflareModelsIncludeTheirNamespace() {
        assertEquals("@cf/meta/llama-3.3-70b-instruct-fp8-fast", Ai.cloudflareModel("llama-3.1-8b-instruct-fast"));
        assertEquals("@cf/meta/llama-3.3-70b-instruct-fp8-fast", Ai.cloudflareModel("@cf/meta/llama-3.3-70b-instruct-fp8-fast"));
    }
    @Test void diagnosticsDoNotExposeProviderResponseBodies() throws Exception {
        FakeClient client = new FakeClient(new Reply(401, of("error", "private credential detail")));
        Ai ai = new Ai(database(), Map.of("GEMINI_API_KEY", "test-only-key"), client);
        Map<String, Object> check = map(map(ai.diagnostics().get("checks")).get("gemini"));
        assertEquals(401, check.get("status")); assertEquals("credentials-or-permissions", check.get("category"));
        assertFalse(stringify(check).contains("private")); assertFalse(stringify(check).contains("test-only-key"));
    }
    @Test void cloudflareDiagnosticsIncludeSafeErrorCodeAndAccountFormatOnly() throws Exception {
        FakeClient client = new FakeClient(new Reply(404, of("errors", List.of(of("code", 7003, "message", "Private account details")))));
        Ai ai = new Ai(database(), Map.of("CF_ACCOUNT_ID", "a".repeat(32), "CF_API_TOKEN", "test-only-key"), client);
        Map<String, Object> check = map(map(ai.diagnostics().get("checks")).get("cloudflare"));
        assertEquals("7003", check.get("providerCode")); assertEquals(true, check.get("configuredAccountIdFormatValid"));
        assertFalse(stringify(check).contains("Private")); assertFalse(stringify(check).contains("test-only-key"));
    }
    @Test void cloudflareResolvesOnlyOneUnambiguousAccount() throws Exception {
        String id = "a".repeat(32);
        FakeClient client = new FakeClient(new Reply(200, of("result", List.of(of("id", id)), "result_info", of("total_count", 1))), new Reply(200, of("result", of("response", "OK"))));
        Ai ai = new Ai(database(), Map.of("CF_ACCOUNT_ID", "invalid", "CF_API_TOKEN", "test-only-key"), client);
        assertEquals("OK", ai.call("cloudflare", "System", "Prompt", 32, false).text());
        assertEquals("GET", client.requests.getFirst().method());
        assertTrue(client.requests.getLast().uri().getPath().contains("/accounts/" + id + "/ai/run/"));
        assertEquals(id, Ai.accountIdFrom("https://dash.cloudflare.com/" + id + "/ai/workers-ai"));
        assertEquals("", Ai.accountIdFrom(id + "/" + "b".repeat(32)));
    }
    private static Database database() throws Exception {
        Database db = new Database("jdbc:h2:mem:ai-" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"); db.migrate(); return db;
    }
    private static Object chat(String text) { return of("choices", List.of(of("message", of("content", text)))); }
    private static Object gemini(String text) { return of("candidates", List.of(of("content", of("parts", List.of(of("text", text)))))); }
    @Test void exhaustedPrimaryFallsThroughToGemini() throws Exception {
        FakeClient client = new FakeClient(new Reply(402, of("error", "Provider credit exhausted")), new Reply(200, gemini("A useful interview answer.")));
        Ai ai = new Ai(database(), Map.of("HF_TOKEN", "test-only-key", "GEMINI_API_KEY", "test-only-key"), client);
        var result = ai.run("chat-with-rex", of("message", "How can I prepare?"));
        assertEquals("gemini", result.get("provider")); assertEquals("A useful interview answer.", result.get("text"));
        assertEquals(2, client.requests.size());
        assertEquals("router.huggingface.co", client.requests.getFirst().uri().getHost());
        assertEquals("generativelanguage.googleapis.com", client.requests.getLast().uri().getHost());
    }
    @Test void gptCoverLetterPassesThroughGeminiBeforeOutput() throws Exception {
        String draft = letter("draft"), refined = letter("refined");
        FakeClient client = new FakeClient(new Reply(200, chat(draft)), new Reply(200, gemini(refined)));
        Ai ai = new Ai(database(), Map.of("HF_TOKEN", "test-only-key", "GEMINI_API_KEY", "test-only-key"), client);
        var result = ai.run("generate-cover-letter", of("jobTitle", "Data Analyst", "jobDescription", "Analyse data and present reports.", "cvText", "Supported accurate reporting."));
        assertEquals(true, result.get("qualityReviewed")); assertEquals("gemini", result.get("provider"));
        assertTrue(str(result, "text").contains("refined")); assertEquals(2, client.requests.size());
        assertTrue(Ai.wordCount(str(result, "text")) >= 750); assertTrue(Ai.wordCount(str(result, "text")) <= 950);
        assertTrue(str(result, "text").startsWith("Dear Hiring Manager,\n\n"));
    }
    @Test void providerErrorsAreNotExposedAsGeneratedText() throws Exception {
        FakeClient client = new FakeClient(new Reply(402, of("error", "depleted provider credits")));
        Ai ai = new Ai(database(), Map.of("HF_TOKEN", "test-only-key"), client);
        ApiException error = assertThrows(ApiException.class, () -> ai.generate("System", "Prompt", List.of("gptoss"), 100, false));
        assertEquals(503, error.status); assertFalse(error.getMessage().contains("credits"));
    }
    @Test void cvPreservesCandidateNamesEmployersAndDates() throws Exception {
        Map<String, Object> generated = of("profile", "A reporting professional.", "skills", List.of("Reporting"), "roles", List.of(of("title", "Fabricated Role", "employer", "Target Company", "dates", "Invented dates", "duties", List.of("As Data Analyst, Analysed service data.", "Validated report inputs.", "Created clear reporting outputs.", "Worked with stakeholders."))));
        Map<String, Object> data = of("name", "Candidate", "phone", "123", "email", "candidate@example.com", "address", "Address", "roles", List.of(of("title", "Data Analyst", "employer", "Actual Employer", "start", "2024-01", "current", true)));
        var document = Ai.cv(generated, data);
        var role = map(list(document.get("roles")).getFirst());
        assertEquals("Actual Employer", role.get("employer")); assertEquals("Data Analyst", role.get("title"));
        assertEquals("2024-01 - Present", role.get("dates")); assertEquals("Analysed service data.", list(role.get("duties")).getFirst());
    }
    private static String letter(String word) {
        return "Dear Hiring Manager,\n\n" + String.join("\n\n", Collections.nCopies(6, (word + " ").repeat(130).strip() + ".")) + "\n\nYours faithfully\nCandidate";
    }
    record Reply(int status, Object body) {}
    static final class FakeClient extends HttpClient {
        final Deque<Reply> replies;
        final List<HttpRequest> requests = new ArrayList<>();
        FakeClient(Reply... replies) { this.replies = new ArrayDeque<>(List.of(replies)); }
        @Override public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler) throws IOException {
            requests.add(request); Reply reply = replies.pollFirst(); if (reply == null) throw new IOException("No simulated response.");
            @SuppressWarnings("unchecked") T body = (T) stringify(reply.body());
            return new HttpResponse<>() {
                public int statusCode() { return reply.status(); }
                public HttpRequest request() { return request; }
                public Optional<HttpResponse<T>> previousResponse() { return Optional.empty(); }
                public HttpHeaders headers() { return HttpHeaders.of(Map.of(), (a, b) -> true); }
                public T body() { return body; }
                public Optional<SSLSession> sslSession() { return Optional.empty(); }
                public URI uri() { return request.uri(); }
                public Version version() { return Version.HTTP_1_1; }
            };
        }
        public Optional<CookieHandler> cookieHandler() { return Optional.empty(); }
        public Optional<Duration> connectTimeout() { return Optional.empty(); }
        public Redirect followRedirects() { return Redirect.NEVER; }
        public Optional<ProxySelector> proxy() { return Optional.empty(); }
        public SSLContext sslContext() { try { return SSLContext.getDefault(); } catch (Exception e) { throw new RuntimeException(e); } }
        public SSLParameters sslParameters() { return new SSLParameters(); }
        public Optional<Authenticator> authenticator() { return Optional.empty(); }
        public Version version() { return Version.HTTP_1_1; }
        public Optional<Executor> executor() { return Optional.empty(); }
        public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest r, HttpResponse.BodyHandler<T> h) { throw new UnsupportedOperationException(); }
        public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest r, HttpResponse.BodyHandler<T> h, HttpResponse.PushPromiseHandler<T> p) { throw new UnsupportedOperationException(); }
    }
}
