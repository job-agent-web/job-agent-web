package com.jobmatchagent;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static com.jobmatchagent.Json.*;

final class Plans {
    private Plans() {}
    static String normalize(String raw) {
        return switch (raw.toLowerCase(Locale.ROOT).replaceAll("(?i)subscription|access|plan", "").replaceAll("[^a-z0-9]", "")) {
            case "monthly", "month", "1month", "onemonth" -> "monthly";
            case "sixmonths", "sixmonth", "6months", "6month" -> "six_month";
            case "yearly", "annual", "year", "1year", "oneyear", "12months", "12month" -> "yearly";
            case "lifetime", "premium", "unlimited" -> "lifetime";
            case "", "free", "trial", "freeweek", "7days" -> "free";
            default -> throw new ApiException(400, "Choose a valid subscription plan.");
        };
    }
    static int duration(String plan) {
        return switch (normalize(plan)) { case "monthly" -> 30; case "six_month" -> 183; case "yearly" -> 365; case "lifetime" -> Integer.MAX_VALUE; default -> 7; };
    }
    static boolean admin(Map<String, Object> metadata) { return Set.of("admin", "super_admin").contains(str(metadata, "role")); }
    static String type(Map<String, Object> metadata) {
        return normalize(first(metadata, "plan_type", "planType", "plan", "subscription_plan", "subscriptionPlan"));
    }
    static Instant instant(String raw, Instant fallback) {
        try { return Instant.parse(raw); } catch (Exception e) { return fallback; }
    }
    static Instant started(Map<String, Object> metadata, String created) {
        return instant(first(metadata, "subscription_started_at", "subscriptionStartedAt", "plan_started_at", "planStartedAt"), instant(created, Instant.now()));
    }
    static Instant expires(Map<String, Object> metadata, String created) {
        if (admin(metadata) || type(metadata).equals("lifetime")) return Instant.MAX;
        return started(metadata, created).plus(duration(type(metadata)), ChronoUnit.DAYS);
    }
    static int remaining(Map<String, Object> metadata, String created, Instant now) {
        Instant expiry = expires(metadata, created);
        if (expiry.equals(Instant.MAX)) return Integer.MAX_VALUE;
        return (int) Math.max(0, Math.ceil((expiry.toEpochMilli() - now.toEpochMilli()) / 86400000.0));
    }
    static List<String> panes(Object value) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        Collection<?> values = value instanceof Collection<?> collection ? collection : Arrays.asList(str(value).split(","));
        for (Object item : values) {
            String pane = str(item).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
            if (pane.matches("[1-9]")) pane = "pane" + pane;
            if (pane.matches("pane[1-9]")) result.add(pane);
        }
        return new ArrayList<>(result);
    }
    static boolean allowed(Map<String, Object> metadata, String created, String pane, Instant now) {
        if (admin(metadata)) return true;
        if (remaining(metadata, created, now) == 0) return false;
        if (panes(metadata.get("locked_panes")).contains(pane)) return false;
        if (panes(metadata.get("unlocked_panes")).contains(pane)) return true;
        return !Set.of("free", "monthly").contains(type(metadata)) || !Set.of("pane4", "pane5", "pane9").contains(pane);
    }
    static void set(Map<String, Object> metadata, String plan, Instant now) {
        metadata.put("plan_type", normalize(plan));
        metadata.put("planType", normalize(plan));
        metadata.put("subscription_started_at", now.toString());
        metadata.put("subscriptionStartedAt", now.toString());
        metadata.put("weekly_bonus_days", 0);
        metadata.put("weeklyBonusDays", 0);
        metadata.put("unlocked_panes", List.of());
        metadata.put("unlockedPanes", List.of());
    }
    static void adjust(Map<String, Object> metadata, String created, int days, Instant now) {
        if (days != 1 && days != -1) throw new ApiException(400, "Use a one-day adjustment.");
        if (expires(metadata, created).equals(Instant.MAX)) throw new ApiException(400, "Lifetime accounts have unlimited days.");
        Instant expiry = expires(metadata, created);
        Instant base = expiry.isAfter(now) ? expiry : now;
        Instant next = base.plus(days, ChronoUnit.DAYS);
        metadata.put("subscription_started_at", next.minus(duration(type(metadata)), ChronoUnit.DAYS).toString());
        metadata.put("subscriptionStartedAt", metadata.get("subscription_started_at"));
        metadata.put("weekly_bonus_days", 0);
        metadata.put("weeklyBonusDays", 0);
    }
    static void claim(Map<String, Object> metadata, String created, Instant now) {
        Instant previous = instant(first(metadata, "weekly_free_day_claimed_at", "weeklyFreeDayClaimedAt"), Instant.EPOCH);
        if (previous.plus(7, ChronoUnit.DAYS).isAfter(now)) throw new ApiException(409, "You have already claimed your free day this week.");
        adjust(metadata, created, 1, now);
        metadata.put("weekly_free_day_claimed_at", now.toString());
        metadata.put("weekly_claim_plan_type", type(metadata));
    }
    static Map<String, Object> snapshot(Map<String, Object> account) {
        Map<String, Object> metadata = object(str(account, "metadata"));
        int days = remaining(metadata, str(account, "created_at"), Instant.now());
        return of("ok", true, "email", account.get("email"), "planType", type(metadata),
            "subscriptionStartedAt", started(metadata, str(account, "created_at")).toString(),
            "paid", admin(metadata) || !type(metadata).equals("free"), "role", str(metadata, "role").isBlank() ? "user" : str(metadata, "role"),
            "lockedPanes", panes(metadata.get("locked_panes")), "unlockedPanes", panes(metadata.get("unlocked_panes")),
            "weeklyBonusDays", 0, "weeklyFreeDayClaimedAt", str(metadata, "weekly_free_day_claimed_at"),
            "weeklyClaimPlanType", str(metadata, "weekly_claim_plan_type"), "daysRemaining", days == Integer.MAX_VALUE ? "Unlimited" : days);
    }
}
