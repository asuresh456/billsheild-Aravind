# BillShield MVP

A small Vercel-ready BillShield prototype: static chat UI plus a serverless `/api/analyze` endpoint. The endpoint sends the user's selected PDF/image and question to the Gemini API. Supabase Auth provides email-link account creation and sign-in; a user must authenticate before starting a review. The database stores chat text and the user's stated context under row-level security. Bill images/PDFs are temporary and are not stored in Supabase.

## Run locally

Install the Vercel CLI and link this folder to the Vercel project. Configure these environment variables in the linked Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable key. This key is intended for browser use; access to user data is protected by Supabase Auth and row-level security (RLS).
- `GEMINI_API_KEY` — server-only Gemini API key. Never use a `NEXT_PUBLIC_` prefix for this key.
- `GEMINI_MODEL` — optional model name; defaults to `gemini-3.5-flash-lite`.

Set the Supabase URL and publishable key for Development, Preview, and Production as needed. Set the Gemini key for the deployment environments where bill analysis should work. For local development, link the project and run `vercel dev`; Vercel supplies the configured Development variables. Alternatively, use the `.env.example` file as a template for a local `.env.local` file. Never commit real keys or values from `.env.local`:

```text
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

Apply `supabase/migrations/20261019154036_user_conversation_memory.sql` once in the Supabase SQL Editor. In Supabase Auth URL Configuration, set the Site URL to the deployed BillShield URL and add that URL plus `http://localhost:3000` to the allowed redirect URLs. The app uses email magic links, so Supabase's email delivery settings must be enabled.

Run `vercel dev` from this folder and open `http://localhost:3000`.

The UI accepts PDF, JPG, PNG, and WebP files up to 3 MB. The server sends them to Gemini for analysis but does not write them to disk or a database. Authenticated conversation text and the user's stated context are saved to their account; row-level security restricts access to the owner. Bill files must be re-uploaded if needed in a later session. Free-tier Gemini content may be used to improve Google's products, so use synthetic or fully redacted bills during development and demos. Do not upload real card statements on the free tier.

## Deploy

1. Push this folder to the linked GitHub repository.
2. In Vercel Project Settings → Environment Variables, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` for the environments you deploy. Keep `GEMINI_API_KEY` server-only. Never add a Supabase service-role or secret key to a `NEXT_PUBLIC_` variable or commit it to Git.
3. In Supabase Auth URL Configuration, set the production Site URL and allow the production URL and local development URL as redirects.
4. Redeploy and open the generated deployment URL.

The default model is `gemini-3.5-flash-lite`, a free-tier multimodal model that accepts PDF and image inputs. Available models and free-tier limits can change; check the Google AI Studio model list and [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). See [Gemini PDF understanding](https://ai.google.dev/gemini-api/docs/document-processing) and [Vercel environment variables](https://vercel.com/docs/environment-variables).
