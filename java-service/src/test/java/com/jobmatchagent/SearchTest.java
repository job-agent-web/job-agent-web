package com.jobmatchagent;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import static com.jobmatchagent.Json.*;
import static com.jobmatchagent.AiTest.*;

class SearchTest {
    @TempDir Path directory;
    private static String row(String url, String title) {
        return "<div class='result'><a class='result__a' href='" + url + "'>" + title + "</a><div class='result__snippet'>Job details</div></div>";
    }
    @Test void parsesRelativeAndAbsoluteRedirectsAndDeduplicates() throws Exception {
        String url = "https://employer.example/jobs/123";
        FakeClient client = new FakeClient(new Reply(200,
            row("/l/?uddg=" + Ai.encoded(url) + "&amp;rut=test", "Analyst")
            + row("//duckduckgo.com/l/?uddg=" + Ai.encoded(url), "Duplicate")
            + row("https://another.example/job", "Another role")));
        var results = new Search(client, directory).results("Analyst & reporting");
        assertEquals(2, results.size()); assertEquals(url, results.getFirst().get("url"));
        assertEquals("Analyst", results.getFirst().get("title"));
        assertTrue(client.requests.getFirst().uri().getRawQuery().contains("%26"));
    }
    @Test void searchDoesNotUnwrapLookalikeHostsOrReturnUnsafeLinks() throws Exception {
        FakeClient client = new FakeClient(new Reply(200, row("https://notduckduckgo.com/l/?uddg=https%3A%2F%2Femployer.example", "Lookalike")
            + row("javascript:alert(1)", "Unsafe") + row("https://user:password@employer.example/job", "Credentials")
            + row("https://employer.example/empty", "") + row("http://[bad", "Malformed")));
        var results = new Search(client, directory).results("Analyst");
        assertEquals(1, results.size());
        assertTrue(str(results.getFirst(), "url").startsWith("https://notduckduckgo.com/"));
    }
    @Test void networkFailureReturnsUsableEmptySearchResponse() throws Exception {
        var result = new Search(new FakeClient(), directory).jobs(of("jobTitle", "Analyst", "location", "London"));
        assertEquals(false, result.get("ok")); assertTrue(list(result.get("jobs")).isEmpty());
        assertTrue(str(result, "message").contains("platform search links"));
    }
    @Test void websiteNormalizesApostrophesAndUsesValidFallbackUrl() throws Exception {
        Files.writeString(directory.resolve("sponsor_websites.json"), stringify(of("websites", of(
            "sainsburys supermarkets", of("careersUrl", "https://", "website", "https://www.sainsburys.co.uk/")))));
        var result = new Search(new FakeClient(), directory).website("Sainsbury's Supermarkets Ltd");
        assertEquals(true, result.get("ok")); assertEquals("https://www.sainsburys.co.uk/", result.get("website"));
    }
    @Test void websiteRejectsMalformedOrCredentialBearingCacheUrls() throws Exception {
        Files.writeString(directory.resolve("sponsor_websites.json"), stringify(of("websites", of("bad", "https://", "secret", "https://user:password@employer.example/"))));
        Search search = new Search(new FakeClient(), directory);
        assertEquals(false, search.website("Bad").get("ok"));
        assertEquals(false, search.website("Secret").get("ok"));
        assertEquals(false, search.website("Unknown").get("ok"));
    }
    @Test void nhsValuesContinueAfterOnePageFails() throws Exception {
        FakeClient client = new FakeClient(new Reply(200, row("https://one.nhs.uk/values", "One") + row("https://two.nhs.uk/values", "Two")),
            new Reply(200, new java.io.IOException("Simulated timeout")), new Reply(200, "<h2>Compassion</h2><h3>Respect</h3>"));
        var result = new Search(client, directory).values("Example NHS Trust");
        assertEquals(true, result.get("ok")); assertEquals(List.of("Compassion", "Respect"), result.get("values"));
        assertEquals("https://two.nhs.uk/values", result.get("sourceUrl"));
    }
    @Test void nhsValuesFetchOnlyHttpsNhsHostsOnStandardPorts() throws Exception {
        FakeClient client = new FakeClient(new Reply(200, row("https://nhs.uk.evil.example/values", "Lookalike")
            + row("http://one.nhs.uk/values", "Plain HTTP") + row("https://one.nhs.uk:444/values", "Other port")
            + row("https://one.nhs.uk/values", "Safe")), new Reply(200, "<h2>Kindness</h2>"));
        var result = new Search(client, directory).values("Example NHS Trust");
        assertEquals(true, result.get("ok")); assertEquals(2, client.requests.size());
    }
    @Test void validatesInputsAndDoesNotSearchUnrelatedCompanyValues() throws Exception {
        FakeClient client = new FakeClient(); Search search = new Search(client, directory);
        assertEquals(400, assertThrows(ApiException.class, () -> search.jobs(of())).status);
        assertEquals(400, assertThrows(ApiException.class, () -> search.website(" ")).status);
        assertEquals(400, assertThrows(ApiException.class, () -> search.values(" ")).status);
        assertEquals(false, search.values("Example Retail").get("ok")); assertTrue(client.requests.isEmpty());
    }
    @Test void searchLimitsResultsAndPreservesJobResponseContract() throws Exception {
        StringBuilder html = new StringBuilder();
        for (int i = 0; i < 40; i++) html.append(row("https://employer.example/job/" + i, "Analyst " + i));
        var result = new Search(new FakeClient(new Reply(200, html.toString())), directory).jobs(of("jobTitle", "Analyst", "location", "London"));
        assertEquals(true, result.get("ok")); assertEquals(30, list(result.get("jobs")).size());
        var job = map(list(result.get("jobs")).getFirst());
        assertEquals(job.get("url"), job.get("applyUrl")); assertEquals("London", job.get("location"));
        assertEquals("Job details", job.get("description"));
    }
}
