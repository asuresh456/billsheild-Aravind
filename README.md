# BillShield MVP

A small Vercel-ready BillShield prototype: static chat UI plus serverless API endpoints. The bill-review endpoint sends the selected PDF/image and question to Gemini. Reviews are available to guests without an account; guest conversations stay in browser memory and are not saved. BillShield manages optional email/password accounts itself; signup sends no email. Passwords are stored only as salted scrypt hashes. Account sessions and signed-in review history are stored in dedicated tables in the existing Supabase Postgres database, accessed only from server routes. The Supabase Auth product is not used by the app. Bill images/PDFs are temporary and are not stored in the database.

## Run locally

Install the Vercel CLI and link this folder to the Vercel project. Configure these environment variables in the linked Vercel project:

- `SUPABASE_URL` — Supabase project URL, used by server routes only.
- `SUPABASE_SECRET_KEY` — Supabase secret API key, used by server routes only to access the private app tables. Never use a `NEXT_PUBLIC_` prefix or commit its value.
- `NODE_ENV=production` — makes the app session cookie secure on production deployments.
- `GEMINI_API_KEY` — server-only Gemini API key. Never use a `NEXT_PUBLIC_` prefix for this key.
- `GEMINI_MODEL` — optional model name; defaults to `gemini-3.5-flash-lite`.

Set the database URL and secret key for Development, Preview, and Production as needed. Set the Gemini key for the deployment environments where bill analysis should work. For local development, link the project and run `vercel dev`; Vercel supplies the configured Development variables. Alternatively, use the `.env.example` file as a template for a local `.env.local` file. Never commit real keys or values from `.env.local`:

```text
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-side-secret-key
```

Apply `supabase/migrations/20261019182000_billshield_app_accounts.sql` once in the Supabase SQL Editor. In Vercel Project Settings → Environment Variables, add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for Development, Preview, and Production as needed, then redeploy. The app does not use Supabase Auth and account signup sends no email. Password recovery is not enabled yet; users who forget their password cannot recover the account. Existing conversation rows remain untouched in the old Supabase Auth tables and are not automatically linked to the new BillShield accounts.

Run `vercel dev` from this folder and open `http://localhost:3000`.

The UI accepts PDF, JPG, PNG, and WebP files up to 3 MB. The server sends them to Gemini for analysis but does not write them to disk or a database. Signed-in conversation text and stated context are saved to the account. Guest conversations are not saved and disappear when the page is refreshed. Bill files must be re-uploaded if needed in a later session. The database secret key bypasses RLS, so it must remain server-side; API routes validate the app session and ownership before reading or writing private rows. Because guest access is public and invokes the Gemini API, configure appropriate Vercel rate limits and a usage budget before sharing widely. Free-tier Gemini content may be used to improve Google's products, so use synthetic or fully redacted bills during development and demos. Do not upload real card statements on the free tier.

## Deploy

1. Push this folder to the linked GitHub repository.
2. In Vercel Project Settings → Environment Variables, add `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` for the environments you deploy. Keep both secret keys server-only; never add a Supabase secret key to a `NEXT_PUBLIC_` variable or commit it to Git.
3. Supabase Auth URL Configuration is no longer used by the app; signup does not send email or require redirect URLs.
4. Redeploy and open the generated deployment URL.

The default model is `gemini-3.5-flash-lite`, a free-tier multimodal model that accepts PDF and image inputs. Available models and free-tier limits can change; check the Google AI Studio model list and [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). See [Gemini PDF understanding](https://ai.google.dev/gemini-api/docs/document-processing) and [Vercel environment variables](https://vercel.com/docs/environment-variables).
