# BillShield MVP

A small Vercel-ready BillShield prototype: static chat UI plus a serverless `/api/analyze` endpoint. The endpoint sends the user's selected PDF/image and question to the Gemini API. Files are not persisted by this prototype; the Gemini API key is read only on the server.

## Run locally

This project has no build step or dependencies. Install the Vercel CLI, create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey), then create `.env.local` in this folder (do not commit it):

```text
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

Run `vercel dev` from this folder and open `http://localhost:3000`.

The UI accepts PDF, JPG, PNG, and WebP files up to 3 MB. The server sends them to Gemini for analysis but does not write them to disk or a database. Free-tier Gemini content may be used to improve Google's products, so use synthetic or fully redacted bills during development and demos. Do not upload real card statements on the free tier.

## Deploy

1. Push this folder to the linked GitHub repository.
2. In Vercel Project Settings → Environment Variables, add `GEMINI_API_KEY` and (optionally) `GEMINI_MODEL` for Preview and Production. Do not prefix the key with `NEXT_PUBLIC_`.
3. Redeploy and open the generated deployment URL.

The default model is `gemini-3.5-flash-lite`, a free-tier multimodal model that accepts PDF and image inputs. Available models and free-tier limits can change; check the Google AI Studio model list and [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). See [Gemini PDF understanding](https://ai.google.dev/gemini-api/docs/document-processing) and [Vercel environment variables](https://vercel.com/docs/environment-variables).
