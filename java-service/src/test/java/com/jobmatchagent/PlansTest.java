package com.jobmatchagent;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static com.jobmatchagent.Json.*;

class PlansTest {
    private static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    @Test void planDurationsMatchTheExistingWebsite() {
        assertEquals(30, Plans.duration("1 month"));
        assertEquals(183, Plans.duration("6 month subscription"));
        assertEquals(365, Plans.duration("12 months"));
        assertEquals(Integer.MAX_VALUE, Plans.duration("Premium Access"));
        assertEquals(7, Plans.duration("free"));
    }
    @Test void monthlyAccountsCannotOpenPaidOnlyPanes() {
        var metadata = of("role", "user"); Plans.set(metadata, "monthly", NOW);
        for (String pane : List.of("pane4", "pane5", "pane9")) assertFalse(Plans.allowed(metadata, NOW.toString(), pane, NOW));
        for (String pane : List.of("pane1", "pane2", "pane3", "pane6", "pane7", "pane8")) assertTrue(Plans.allowed(metadata, NOW.toString(), pane, NOW));
    }
    @Test void explicitLocksWinAndExpiredAccountsAreLocked() {
        var metadata = of("role", "user"); Plans.set(metadata, "yearly", NOW);
        metadata.put("locked_panes", List.of("pane2")); metadata.put("unlocked_panes", List.of("pane2"));
        assertFalse(Plans.allowed(metadata, NOW.toString(), "pane2", NOW));
        metadata.put("subscription_started_at", NOW.minus(400, ChronoUnit.DAYS).toString());
        for (int i = 1; i <= 9; i++) assertFalse(Plans.allowed(metadata, NOW.toString(), "pane" + i, NOW));
    }
    @Test void monthlyPlanResetsStaleUnlocks() {
        var metadata = of("role", "user", "unlocked_panes", List.of("pane9"));
        Plans.set(metadata, "monthly", NOW);
        assertFalse(Plans.allowed(metadata, NOW.toString(), "pane9", NOW));
    }
    @Test void expiredClaimAddsExactlyOneDayAndBlocksRepeat() {
        var metadata = of("role", "user"); Plans.set(metadata, "monthly", NOW.minus(80, ChronoUnit.DAYS));
        Plans.claim(metadata, NOW.minus(80, ChronoUnit.DAYS).toString(), NOW);
        assertEquals(1, Plans.remaining(metadata, NOW.toString(), NOW));
        ApiException error = assertThrows(ApiException.class, () -> Plans.claim(metadata, NOW.toString(), NOW));
        assertEquals(409, error.status);
    }
    @Test void activeClaimAndAdminAdjustmentsChangeOneDayOnly() {
        var metadata = of("role", "user"); Plans.set(metadata, "monthly", NOW);
        Plans.claim(metadata, NOW.toString(), NOW);
        assertEquals(31, Plans.remaining(metadata, NOW.toString(), NOW));
        Plans.adjust(metadata, NOW.toString(), 1, NOW);
        assertEquals(32, Plans.remaining(metadata, NOW.toString(), NOW));
        Plans.adjust(metadata, NOW.toString(), -1, NOW);
        assertEquals(31, Plans.remaining(metadata, NOW.toString(), NOW));
    }
    @Test void importedCamelCasePaneOverridesAreEnforcedAndReported() {
        var metadata = of("planType", "monthly", "subscriptionStartedAt", Instant.now().toString(),
            "lockedPanes", List.of("pane2"), "unlockedPanes", List.of("pane9"),
            "weeklyFreeDayClaimedAt", NOW.toString(), "weeklyClaimPlanType", "monthly");
        assertFalse(Plans.allowed(metadata, NOW.toString(), "pane2", NOW));
        assertTrue(Plans.allowed(metadata, NOW.toString(), "pane9", NOW));
        var snapshot = Plans.snapshot(of("metadata", stringify(metadata), "created_at", NOW.toString()));
        assertEquals(List.of("pane2"), snapshot.get("lockedPanes"));
        assertEquals(List.of("pane9"), snapshot.get("unlockedPanes"));
        assertEquals(NOW.toString(), snapshot.get("weeklyFreeDayClaimedAt"));
        assertEquals("monthly", snapshot.get("weeklyClaimPlanType"));
        metadata.put("locked_panes", List.of());
        assertTrue(Plans.allowed(metadata, NOW.toString(), "pane2", NOW));
    }
    @Test void invalidPaneNamesFailClosedEvenForAdmins() {
        for (String role : List.of("user", "admin")) {
            var metadata = of("role", role); Plans.set(metadata, "lifetime", NOW);
            assertFalse(Plans.allowed(metadata, NOW.toString(), "pane10", NOW));
            assertFalse(Plans.allowed(metadata, NOW.toString(), "", NOW));
        }
    }
}
