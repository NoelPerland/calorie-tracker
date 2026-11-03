# Calorie Tracker — AI continuation brief

## Product and visual identity

Calorie Tracker is a neutral food journal for meals, daily calories/macros and history. Login is optional: **Continue on this device** opens a locally persistent journal. Optional Supabase accounts retain cloud sync, ChatGPT integration and food-photo analysis. Guest mode also supports barcode lookup through Open Food Facts.

Preserve the existing dark forest-green interface, lime accents, generous daily summary and readable meal list. Keep language descriptive and pressure-free: no restrictive targets, weight-loss goals or invented nutrition advice. Guest mode must clearly explain local storage and account-only features.

## Architecture and entry points

- React 19, TypeScript, Vite and Tailwind/CSS. Supabase Auth/Postgres/Realtime and Edge Functions provide account features.
- `src/App.tsx`: optional authentication, explicit guest entry, Today/History, shared manual create/edit form, barcode/photo dialog and account workflow.
- `src/guest.ts`: localStorage journal creation, validated ownership, load/save/delete and erase. Each new journal has a random ID.
- `src/data.ts`: dates, totals and barcode product normalization.
- `supabase/functions/_shared/food.ts`: strict shared food validation. Preserve it for every write path.
- `src/style.css`: existing design plus guest notices and reduced-motion support.

## Privacy invariants

Guest entries never upload to accounts. Account entries never enter the guest journal. Signing in switches to a separate owner-filtered account view; signing out does not automatically open guest data. Reload requires explicit **Continue on this device** before showing saved guest entries.

Device-local is **not encrypted** and not separate from other people sharing the browser profile: anyone using that profile can explicitly reopen its journal. Keep that notice visible. **Erase journal** removes the local journal and revokes it in other open tabs. A fresh journal is empty. Corrupt data is reported without overwriting it; failed writes must not report success.

Manual guest logging makes no remote meal-data calls. Barcode lookup sends the product code to Open Food Facts. Photo inference and ChatGPT stay account-only. Do not silently migrate, merge or delete guest data on account login.

## Continue on another device

Use Node 24. Clone this repository, check out `handoff/studio-redesign`, run `npm ci`, then `npm run dev`. Open the Vite URL with the `/calorie-tracker/` path. Production checks: `npm run build`, then `npm run preview -- --port 3132 --strictPort`, and open http://localhost:3132/calorie-tracker/.

Guest mode works without environment configuration. Account features need `.env.local` public Supabase URL/anon key as documented in README and an appropriately configured existing backend. Never put service-role keys or private credentials into `VITE_` variables. Keep existing RLS and account data intact.

Git transfers source, not browser guest entries, account sessions, `.env.local`, database content, build outputs or screenshots. Guest meals on the previous browser will not appear on the next device. There is no guest cloud backup or automatic migration.

## Verification and release limits

Production build/typecheck and unit tests passed. Browser checks passed create/edit/delete, totals/history, reload, explicit resume, browser-profile isolation, cross-tab erase, corrupt storage, mobile layout and a mocked barcode response. `npm run test:account` passed sign-in/sign-out, ownership-filtered writes and guest/account separation against a mocked Supabase service. **Live account login, photo inference and live barcode responses were not verified in this work.** No real credentials are embedded in the test fixtures.

Run `npm test`, `npm run build`, `npm run test:browser` (preview server required), and `npm run test:account`. Browser tests require installed Chrome/Chromium; override `CHROME_PATH` if needed. Account fixture tests build only under ignored `.qa`, preserving production `dist` output.

Existing GitHub Pages workflow deploys pushes to `main`. This work is on `handoff/studio-redesign` to transfer source without triggering that deployment. Review/merge intentionally when ready. Update the portfolio's old account-required wording only after verifying the new hosted version; portfolio was not changed here.
