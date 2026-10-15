# Job Match Agent: Java + Neon on Vercel

The existing site uses a Java 21 backend and Neon PostgreSQL. Its public address remains https://jobmatchagent.vercel.app. The browser interface, CV uploads, previews, Word downloads, sponsor list, career library, and dark mode are retained. Browser JavaScript handles document parsing and interaction; account/business logic and provider requests run in Java.

## Deployment

The existing GitHub repository is `job-agent-web/job-agent-web`, branch `main`, linked to the existing Vercel project `jobmatchagent`. Root `vercel.json` selects the container runtime, and root `Dockerfile.vercel` builds the public assets and Maven service. Java tests run inside the container build. No new repository or public domain is required.

From the project directory:

```powershell
.\java-service\manage.ps1 -Action Build
.\java-service\manage.ps1 -Action Preview
.\java-service\manage.ps1 -Action Deploy
```

The PowerShell commands can stage a minimal deployment under the ignored `.vercel/java-staging` folder. Root GitHub deployments and staged deployments share the same public-asset preparation script and Java source. The portable JDK/Maven cache is used on this computer when no system installation is available.

## Provisioned Storage

A separate free-plan Neon resource named `jobmatchagent` was created through the existing Vercel Marketplace connection in US East (N. Virginia). The Shift Planner database was not modified. Vercel supplies `DATABASE_URL` to Preview and Production. Private signing secrets were generated and stored in Vercel, not GitHub.

Neon stores account UUIDs and metadata, password hashes, refresh sessions, OTP state, usage, cover-letter samples, and admin audit records. Schema creation is transaction-locked so simultaneous container startups cannot race.

## Account Transfer

Five existing accounts and two nonempty cover-letter master samples were transferred from the old Supabase project. Plans, plan start times, explicit pane overrides, and claim metadata were preserved. The old `user_usage` table had no rows. The source was read-only and was not deleted.

The service-role export does not expose existing password hashes. Imported users keep their passwords: on their first successful sign-in, Java verifies the password against the old authentication service and saves a bcrypt hash in Neon. Later password sign-ins use Neon. This is a temporary compatibility dependency, not a claim that Supabase has already been removed completely.

Verification emails also use the existing authentication email service until `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` are configured. OTP state and new local sessions are stored in Neon. Do not delete the old Supabase project yet. Old browser sessions require a fresh sign-in after cutover.

The read-only source importer is accessible only on a protected Preview deployment with the private `MIGRATION_CONTROL_SECRET`. Production does not have that variable. Repeat imports refresh only untouched pending accounts, never accounts modified in Neon.

## Admin and Entitlements

Open https://jobmatchagent.vercel.app/admin.html and use the existing private Vercel `ADMIN_DASHBOARD_SECRET`. The old hard-coded `job-agent` bypass is not accepted by the Java backend. Keep the private passkey out of browser code and GitHub.

Plan/role/pane/day changes save directly to Neon; user refresh requests read the authoritative account. Monthly and free accounts cannot access panes 4, 5, and 9 unless explicitly unlocked. Expired users cannot access any generation pane. Locked requests are rejected on the server even if browser controls are bypassed.

Day adjustments change access by exactly one day. A weekly claim on an expired account grants exactly one day; duplicate claims within seven days are rejected under a database row lock. Failed AI requests do not consume a generation allowance.

## AI State at Migration

Private live probes returned Gemini HTTP 429 (quota/rate limit), DeepSeek HTTP 402, GPT-OSS/Hugging Face HTTP 402 (credits), and Cloudflare HTTP 404. Cloudflare's retired model configuration was updated to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, but the saved account ID is not a valid 32-character account identifier. Automatic account discovery could not resolve it unambiguously; the final probe returned `CF_ACCOUNT_ID_INVALID`. Successful live generation is not verified while these provider errors persist.

`/api/ai-health` reports configuration only, not successful generation. `/api/ai-smoke-test` requires the private admin passkey. Provider failures do not appear as successful AI text. The current browser's built-in fallback remains available where already supported.

Restore quota/credits for at least one provider, or correct the Cloudflare account/token access, and redeploy after changing Vercel variables. The Java route tries GPT-OSS, DeepSeek, Gemini, Cloudflare, then Hugging Face for CV/cover-letter/Rex. A non-Gemini cover-letter draft is sent through Gemini refinement when available. Letters enforce the requested 750-950 word range.

## Verification and Limits

Local tests cover login/session security, OTP attempt limits, immediate plan changes, role/pane restrictions, weekly claims under concurrency, master samples, CV identity preservation, provider failover/refinement, and safe error reporting. A browser-bridge test checks same-origin routing and selected-CV payload preservation. Hosted checks confirmed Neon readiness, synthetic password sign-in, current plan lookup, monthly restrictions, and one-day claim/repeat rejection. Synthetic verification accounts are removed after deployment checks.

Email delivery and first-sign-in of a real migrated user cannot be confirmed without that user's code/password. Live AI generation remains blocked by the provider responses above. A full visual interaction test of every pane is not implied by API/unit-test success.

Uploaded arbitrary scraper programs are not executed; the compatibility route performs safe web search. Company-site lookups use the curated cache and do not label unverified sites as official. Existing search buttons remain available.

Secrets, pulled environment files, QA session data, deployment tokens, and migration control files stay under ignored `.vercel` or `.env*` paths. Public routes expose only an explicit asset allowlist.

## Rollback

Vercel retains the earlier Node production deployment. A code rollback alone does not copy later Neon account changes back to Supabase; reconcile account changes before reverting databases. Do not reset or delete either database as a code troubleshooting step.

Documentation: https://vercel.com/docs/functions/runtimes/container and https://neon.com/docs/guides/java
