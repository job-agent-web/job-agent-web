package com.jobmatchagent;

import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import static com.jobmatchagent.Json.*;

/** Temporary compatibility for existing passwords and configured verification-email delivery. */
final class LegacyAuth {
    private final Map<String, String> env;
    private final HttpClient http;
    LegacyAuth(Map<String, String> env, HttpClient http) { this.env = env; this.http = http; }
    boolean available() { return !env.getOrDefault("SUPABASE_URL", "").isBlank() && !env.getOrDefault("SUPABASE_ANON_KEY", "").isBlank(); }
    Map<String, Object> request(String endpoint, Object payload) throws Exception {
        if (!available()) throw new ApiException(503, "Account verification is temporarily unavailable.");
        String base = env.get("SUPABASE_URL").strip().replaceAll("/+$", "");
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(base + "/auth/v1/" + endpoint))
            .timeout(Duration.ofSeconds(20)).header("apikey", env.get("SUPABASE_ANON_KEY").strip()).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(stringify(payload), StandardCharsets.UTF_8)).build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 300) {
            if (response.statusCode() == 429) throw new ApiException(429, "Please wait before trying again.");
            if (response.statusCode() >= 500) throw new ApiException(503, "Account verification is temporarily unavailable.");
            throw new ApiException(400, "The password or verification code is incorrect or has expired.");
        }
        return response.body().isBlank() ? of("ok", true) : object(response.body());
    }
    boolean verifyPassword(String email, String password) throws Exception {
        Map<String, Object> response = request("token?grant_type=password", of("email", email, "password", password));
        return email.equalsIgnoreCase(str(map(response.get("user")), "email")) && !str(response, "access_token").isBlank();
    }
    void sendOtp(String email, String name, boolean create) throws Exception {
        request("otp", of("email", email, "create_user", create, "data", of("user_name", name, "full_name", name)));
    }
    Map<String, Object> verifyOtp(String email, String code) throws Exception {
        Map<String, Object> response = request("verify", of("email", email, "token", code, "type", "email"));
        Map<String, Object> user = map(response.get("user"));
        if (!email.equalsIgnoreCase(str(user, "email"))) throw new ApiException(400, "The verification code is incorrect or has expired.");
        return user;
    }
}
