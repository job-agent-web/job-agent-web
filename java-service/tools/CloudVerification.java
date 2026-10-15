package com.jobmatchagent;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import static com.jobmatchagent.Database.*;
import static com.jobmatchagent.Json.*;

/** Deployment checks use a marked synthetic account and never modify an existing account. */
public final class CloudVerification {
    public static void main(String[] args) throws Exception {
        Database db = new Database(System.getenv("DATABASE_URL"));
        String action = args[0];
        if (action.equals("summary")) {
            try (Connection c = db.open()) {
                var rows = query(c, "SELECT metadata FROM jma_accounts");
                var plans = new TreeMap<String, Integer>(); int pending = 0, locks = 0;
                for (var row : rows) {
                    var metadata = object(str(row, "metadata"));
                    plans.merge(Plans.type(metadata), 1, Integer::sum);
                    if (bool(metadata.get("_legacy_password_pending"))) pending++;
                    if (!Plans.panes(metadata.get("locked_panes")).isEmpty()) locks++;
                }
                System.out.println(stringify(of("accounts", rows.size(), "plans", plans, "passwordsPendingFirstSignIn", pending,
                    "accountsWithExplicitPaneLocks", locks, "coverLetterSamples", Admin.settings(c).values().stream().filter(v -> !str(v).isBlank()).count())));
            }
            return;
        }
        Path stateFile = Path.of(args[1]);
        Accounts accounts = new Accounts(db, System.getenv(), HttpClient.newHttpClient());
        if (action.equals("create")) {
            if (Files.exists(stateFile)) throw new IllegalStateException("Verification state already exists. Clean up the previous marked test account first.");
            String run = UUID.randomUUID().toString();
            var session = db.transaction(c -> {
                var account = accounts.create(c, "migration-qa-" + run + "@example.invalid", "Deployment verification", Accounts.random(24), "user");
                var metadata = object(str(account, "metadata"));
                Plans.set(metadata, "yearly", Instant.now()); metadata.put("_qa_run", run);
                execute(c, "UPDATE jma_accounts SET metadata=? WHERE id=?", stringify(metadata), Accounts.id(account));
                var result = accounts.issue(c, accounts.find(c, str(account, "email"), false));
                result.put("qaRun", run); return result;
            });
            Files.writeString(stateFile, stringify(session), StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
            System.out.println("Created marked synthetic deployment-check account; session retained only in the excluded local verification file.");
        } else if (Set.of("delete", "monthly", "yearly", "expired", "login").contains(action)) {
            var state = object(Files.readString(stateFile)); String run = str(state, "qaRun");
            String email = str(map(state.get("user")), "email");
            if (!email.equals("migration-qa-" + run + "@example.invalid")) throw new IllegalStateException("Test account name does not match the verification marker.");
            db.transaction(c -> {
                var account = accounts.find(c, email, true);
                if (account == null) return null;
                if (!run.equals(str(object(str(account, "metadata")), "_qa_run"))) throw new IllegalStateException("Account is not the marked test account.");
                if (action.equals("delete")) execute(c, "DELETE FROM jma_accounts WHERE id=?", Accounts.id(account));
                else if (action.equals("login")) {
                    String password = Accounts.random(24);
                    execute(c, "UPDATE jma_accounts SET password_hash=? WHERE id=?", org.mindrot.jbcrypt.BCrypt.hashpw(password, org.mindrot.jbcrypt.BCrypt.gensalt(12)), Accounts.id(account));
                    Files.writeString(stateFile.resolveSibling("qa-login-request.json"), stringify(of("email", email, "password", password)), StandardCharsets.UTF_8);
                } else {
                    var metadata = object(str(account, "metadata"));
                    Plans.set(metadata, action.equals("expired") ? "monthly" : action, action.equals("expired") ? Instant.now().minus(Duration.ofDays(80)) : Instant.now());
                    metadata.put("weekly_free_day_claimed_at", ""); metadata.put("weeklyFreeDayClaimedAt", "");
                    execute(c, "UPDATE jma_accounts SET metadata=? WHERE id=?", stringify(metadata), Accounts.id(account));
                }
                return null;
            });
            System.out.println(action.equals("delete") ? "Removed only the marked synthetic deployment-check account." : "Updated only the marked synthetic deployment-check account for " + action + " verification.");
        } else throw new IllegalArgumentException("Unknown deployment check action.");
    }
}
