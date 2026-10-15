package com.jobmatchagent;

import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.nio.file.*;
import java.util.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import static com.jobmatchagent.Json.*;

final class Search {
    private final HttpClient http;
    private final Map<String, Object> websites;
    Search(HttpClient http, Path publicDirectory) {
        this.http = http;
        Map<String, Object> cached;
        try { cached = map(object(Files.readString(publicDirectory.resolve("sponsor_websites.json"))).get("websites")); }
        catch (Exception e) { cached = Map.of(); }
        websites = cached;
    }
    Map<String, Object> jobs(Map<String, Object> body) throws Exception {
        String title = str(body, "jobTitle"), location = str(body, "location");
        if (title.isBlank()) throw new ApiException(400, "Enter a job title.");
        String query = title + " " + location + " visa sponsorship jobs";
        List<Map<String, Object>> jobs = new ArrayList<>();
        for (Map<String, Object> item : results(query)) {
            jobs.add(of("title", item.get("title"), "company", "See employer listing", "location", location,
                "url", item.get("url"), "applyUrl", item.get("url"), "snippet", item.get("snippet"), "description", item.get("snippet"),
                "sponsorship", "Check the employer listing for eligibility", "source", "Web search"));
        }
        return of("ok", !jobs.isEmpty(), "jobs", jobs, "message", jobs.isEmpty() ? "No current listings could be retrieved. Use the platform search links to continue." : "Review each employer listing for current availability and sponsorship requirements.");
    }
    Map<String, Object> website(String company) throws Exception {
        if (company.isBlank()) throw new ApiException(400, "Enter a company name.");
        String key = company.toLowerCase(Locale.ROOT).replace("&", " and ").replaceAll("[^a-z0-9]+", " ")
            .replaceAll("\\b(ltd|limited|plc|llp|inc|uk|company|group|holdings|services|service)\\b", " ").replaceAll("\\s+", " ").strip();
        Object entry = websites.getOrDefault(key, websites.get(company.toLowerCase(Locale.ROOT)));
        String cached = entry instanceof String text ? text : first(map(entry), "careersUrl", "website");
        if (cached.startsWith("https://")) return of("ok", true, "company", company, "website", cached, "source", "sponsor-websites-cache");
        return of("ok", false, "company", company, "website", "", "message", "Use the company name to verify the official website.",
            "searchUrl", "https://duckduckgo.com/?q=" + Ai.encoded(company + " official website"));
    }
    Map<String, Object> values(String company) throws Exception {
        if (company.isBlank()) throw new ApiException(400, "Enter a company name.");
        if (!company.toLowerCase(Locale.ROOT).matches(".*(nhs|trust|hospital).*")) return of("ok", false, "values", List.of(), "sourceUrl", "");
        for (Map<String, Object> result : results(company + " NHS trust our values")) {
            URI uri = URI.create(str(result, "url"));
            if (!uri.getScheme().equals("https") || !uri.getHost().endsWith(".nhs.uk") || (uri.getPort() != -1 && uri.getPort() != 443)) continue;
            HttpResponse<String> response = http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) continue;
            var page = Jsoup.parse(response.body());
            List<String> headings = page.select("h1,h2,h3,h4").stream().map(Element::text)
                .filter(value -> value.matches("(?i).*(compassion|respect|integrity|teamwork|excellence|kindness|inclusion|accountability|courage).*"))
                .filter(value -> value.length() < 120).distinct().limit(8).toList();
            if (!headings.isEmpty()) return of("ok", true, "values", headings, "sourceUrl", uri.toString());
        }
        return of("ok", false, "values", List.of(), "sourceUrl", "", "message", "No verified organisation values were found.");
    }
    List<Map<String, Object>> results(String query) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://html.duckduckgo.com/html/?q=" + Ai.encoded(query)))
            .timeout(Duration.ofSeconds(15)).header("User-Agent", "Mozilla/5.0").GET().build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) return List.of();
        List<Map<String, Object>> results = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Element row : Jsoup.parse(response.body()).select(".result")) {
            Element link = row.selectFirst(".result__a");
            if (link == null) continue;
            String url = link.attr("href");
            if (url.startsWith("//")) url = "https:" + url;
            URI uri;
            try {
                uri = URI.create(url);
                if (uri.getHost() != null && uri.getHost().endsWith("duckduckgo.com")) {
                    for (String part : Optional.ofNullable(uri.getRawQuery()).orElse("").split("&"))
                        if (part.startsWith("uddg=")) url = Database.decode(part.substring(5));
                    uri = URI.create(url);
                }
            } catch (Exception e) { continue; }
            if (!Set.of("https", "http").contains(Optional.ofNullable(uri.getScheme()).orElse("")) || uri.getHost() == null || !seen.add(url)) continue;
            results.add(of("title", link.text(), "url", url, "snippet", row.select(".result__snippet").text()));
            if (results.size() >= 30) break;
        }
        return results;
    }
}
