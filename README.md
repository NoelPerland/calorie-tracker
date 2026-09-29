# Calorie Tracker

A small React + TypeScript nutrition tracker. Vite, Tailwind CSS, Supabase Auth/Postgres/Realtime, and GitHub Pages. Add, edit, and delete meals; see daily calories and macros; open any logged day in History. Times and day boundaries use the device's local timezone. Values can be estimates; there are no imposed calorie targets.

## 1. Create Supabase

The Supabase project **calorie-tracker** is connected at `https://wjwzxgtrccjnfvkjaiyr.supabase.co`. The app requires email/password authentication. Email confirmation remains enabled.

In Authentication → URL Configuration, set the Site URL to `https://NoelPerland.github.io/calorie-tracker/`. Add that exact URL and `http://localhost:5173/calorie-tracker/` (or `http://127.0.0.1:5173/calorie-tracker/`) as allowed redirect URLs. After confirming their email, users sign in and arrive directly on Today.

## 2. Environment

Requires Node.js **22.12+**, or current Node 24 LTS. Copy `.env.example` to `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

These two values are public configuration and are embedded in the frontend. Never put a service-role key, secret API key, database password, or Supabase access token in a `VITE_` variable. Authorization is enforced by RLS, not by hiding the anon key.

## 3. Database setup

Run `supabase/migrations/20260929000000_food_entries.sql` **once** in the project's SQL editor. It creates the table, constraints, indexed owner/date lookup, four owner-only RLS policies, and Realtime publication membership. Anonymous clients have no table access. Updates cannot transfer an entry to another user.

Alternatively, with the Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref wjwzxgtrccjnfvkjaiyr
npx supabase db push
```

The UI subscribes to changes and refreshes on window focus and every minute as a fallback. History fetches paginated rows, so Supabase's default 1,000-row limit does not silently drop older meals. Daily aggregation happens locally; move it into a timezone-aware SQL function if the personal log becomes very large.

## 4. Run locally

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/calorie-tracker/`. Without environment values, the app shows a setup message; it never pretends to save food. Create an account, confirm email, then sign in.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

The build includes TypeScript checks. Tests cover the shared API/form validation, ownership-field rejection, timestamp normalization, totals, and local date grouping. The Edge Function uses Deno; check it separately with `deno check supabase/functions/add-food/index.ts`.

## 5. GitHub Pages deployment

The target repository is **NoelPerland/calorie-tracker**. Push this directory's contents to its `main` branch. In Settings → Pages, select **GitHub Actions** as the source. In Settings → Secrets and variables → Actions → Variables, create `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the public values above when available.

Every push to `main`, or manual run of `.github/workflows/deploy.yml`, installs locked dependencies, runs tests, checks TypeScript, builds the frontend, checks the Edge Function, and deploys the `dist` artifact. Until Supabase is configured, placeholder values deploy the explicit setup screen. Once the real repository variables are set, rerun the workflow to enable authentication and meal tracking. A placeholder deployment cannot save meals.

The result is `https://NoelPerland.github.io/calorie-tracker/`. `vite.config.ts` sets `base: '/calorie-tracker/'`; navigation is in-app and does not depend on server rewrites. If you rename the repository, update the base path and Auth redirect URLs together.

GitHub Pages hosts only the frontend. Deploy the database and Edge Function to Supabase separately:

```sh
npx supabase functions deploy add-food --project-ref wjwzxgtrccjnfvkjaiyr
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied to hosted Edge Functions by Supabase. No privileged service key is used. The function has gateway JWT verification disabled because it verifies the bearer token itself with `auth.getUser()` and forwards that user token to the database for RLS enforcement.

## 6. ChatGPT integration

The deployed MCP endpoint is:

```text
https://wjwzxgtrccjnfvkjaiyr.supabase.co/functions/v1/calorie-mcp
```

In ChatGPT, enable Developer mode in **Settings → Security and login**, open **Plugins**, add that MCP URL, and connect your Calorie Tracker account. Then use the plugin in a Work chat and say what you ate. ChatGPT estimates calories and macros and calls `log_food`; the app receives the new row live with a **CHAT** badge.

Supabase Auth provides OAuth 2.1 account linking. In **Authentication → OAuth Server**, enable the server, set the authorization path to `/oauth/consent`, and enable dynamic client registration. The consent page is part of the React app. GitHub Pages deploys `index.html` as `404.html` too, so the consent URL works when opened directly.

The MCP server validates the Supabase access token, writes with that user token, and relies on the same owner-only RLS policies as the app. ChatGPT performs the estimate; there is no separate OpenAI API key and no service-role key.

The lower-level JSON endpoint remains available for other clients:

`POST https://wjwzxgtrccjnfvkjaiyr.supabase.co/functions/v1/add-food`

Headers:

```http
Authorization: Bearer USER_SUPABASE_ACCESS_TOKEN
apikey: YOUR_PUBLIC_ANON_KEY
Content-Type: application/json
```

Body:

```json
{
  "name": "2 eggs, chicken bacon and baked beans",
  "calories": 372,
  "protein": 30,
  "carbs": 28,
  "fat": 12,
  "eaten_at": "2026-09-29T08:00:00+02:00",
  "source": "chat"
}
```

`notes` is optional. `source` defaults to `manual`; a chat connector should always send `chat`. The endpoint accepts only these documented fields, limits input to 16 KB, validates names/macros/timestamps, and derives `user_id` exclusively from the authenticated token. Success is `201 { "entry": { ... } }`. Errors: 400 invalid data, 401 invalid/missing user authentication, 405 wrong method, 413 oversized body, 415 wrong content type, 500 database failure, or 503 temporary service failure. CORS permits browser callers but does not replace authentication.

Chat-created entries remain editable. Both endpoints create a new entry per successful call, so clients should not blindly retry after an ambiguous timeout.

## Live acceptance checks

After configuring your project, verify with two accounts: each can add/read/edit/delete its own rows, neither can select or mutate the other's IDs, and anonymous table requests fail. Call the API with a user token and verify the new entry appears in the open app; repeat with an expired token and an attempted `user_id` override and expect rejection. These checks need a real Supabase project and are distinct from local unit/UI tests.

## References

- [Vite deployment and base path](https://vite.dev/guide/static-deploy)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

