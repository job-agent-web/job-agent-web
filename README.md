# Job Match Agent

Java 21 backend, Neon PostgreSQL, and the existing Vercel deployment at https://jobmatchagent.vercel.app.

The current browser interface is preserved, including CV uploads, Word downloads, sponsor search, CV scoring, career planning, interview preparation, Rex, dark mode, and admin account controls.

- `vercel.json`: existing Vercel project's Java container routing.
- `Dockerfile.vercel`: reproducible public-asset and Java build.
- `java-service/src`: accounts, sessions, plans, usage, AI requests, and admin logic.
- `java-service/README.md`: migration status, deployment steps, provider limitations, and rollback guidance.
- Existing browser files: interface, document parsing, formatting, and client-side fallbacks.

Accounts and settings have been transferred to Neon. Existing passwords and verification emails temporarily use the old authentication service during migration. Do not delete the old Supabase project yet.

AI credentials are configured, but live provider probes currently report quota/credit/access errors. Configuration is not proof of successful generation. See the Java README for the exact checks and required provider action.

Never upload database credentials, private environment files, `.vercel`, or session/signing secrets. The older Node/Netlify server files are migration reference only; Vercel uses the Java container configuration.
