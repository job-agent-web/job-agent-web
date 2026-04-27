# Job Match Agent Web

This is the browser-safe version of the app for free hosting and link sharing.

## What it does

- starts with hosted sign up and sign in
- accepts one or many pasted job adverts
- scores each role against the selected CV
- checks salary against your floor
- flags likely sponsorship signals and red flags
- suggests what to emphasise when tailoring your CV
- checks company names against the bundled UK sponsor register snapshot
- tracks free matches and free platform searches for monitoring
- provides a separate admin URL for user monitoring

## Files to host

Host everything in this folder:

- `index.html`
- `app.html`
- `admin.html`
- `auth.js`
- `app.js`
- `admin.js`
- `styles.css`
- `uk_sponsors.js`
- `netlify.toml`
- `supabase-user-usage.sql`
- `netlify/functions/nhs-values.js`
- `netlify/functions/run-scraper.js`
- `netlify/functions/admin-users.js`
- `netlify/functions/record-usage.js`
- `netlify/functions/send-signup-otp.js`
- `netlify/functions/verify-signup-otp.js`
- `netlify/functions/generate-cover-letter.js`

## Important limitations

This browser version:

- does not directly connect to Indeed's private internal systems
- does not include one-click sponsor list refresh
- does not include desktop-only official website lookup
- can fetch NHS Trust values live when deployed on Netlify with the included serverless function
- uses direct platform search buttons for hosted browsing instead of uploaded scraper adapters
- now expects hosted access through sign up/sign in before `app.html`

## Supabase setup

1. In Supabase SQL Editor, run:
   - `supabase-user-usage.sql`
2. In Supabase Auth, keep your passwordless email template configured the way you want.
3. Keep your Supabase URL and anon key in the frontend files already wired here.
4. Add your `SUPABASE_SERVICE_ROLE_KEY` only in Netlify environment variables, never in the frontend.

## Netlify environment variables

Add these before using the admin monitor:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_DASHBOARD_SECRET`

Add these to enable secure OpenAI-powered STAR cover letters on the hosted site:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, for example `gpt-4.1-mini`)

## Admin monitor URL

After deploy, open:

- `/admin.html`

Example:

- `https://your-site.netlify.app/admin.html`

The admin page shows:

- user name
- email
- signup date
- last sign in
- free matches remaining
- free searches remaining
- plan status

## Free hosting with Netlify

1. Go to [Netlify](https://app.netlify.com/drop)
2. Sign in or create a free account
3. Open this folder:
   `C:\Users\imasu\OneDrive\Desktop\office\job-agent\job-agent-web`
4. Drag the entire folder contents into Netlify, including the `netlify` folder
5. Netlify will publish the site and provision the functions
6. Add the Netlify environment variables listed above
7. Open the hosted root URL for normal users
8. Open `/admin.html` for monitoring

## Updating the hosted version later

If you change the web files later, redeploy the same folder contents again so the admin page and functions stay in sync.
