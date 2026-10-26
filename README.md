# Hook Menclub

Thai-first barber booking platform: React, Vite, TypeScript, Tailwind, Supabase Postgres/Auth/Edge Functions; Vercel frontend target.

**Development foundation, not a live booking service.** The existing `hook-menclub-demo.html` is preserved as a reference. The database seed contains explicitly labelled placeholders with no invented prices, names or photos and disables online booking.

## Parallel work

- Claude: customer pages/components/translations as defined in [the frontend handoff](docs/CLAUDE_HANDOFF.md).
- Codex: configuration, shared [API contract](docs/API_CONTRACT.md), adapters, database, server functions, admin and integration.
- Shared types: `src/types/api.ts`. Do not independently change the contract or implement availability in the browser.
- Customer pages are integrated at `/`, `/book`, `/confirmation`, and `/manage`. The router keeps private navigation state in memory; only an opaque key reaches browser history. Language preference may persist independently.
- This folder initially had no Git repository. In the current shared-folder workflow, keep to assigned files. For separate worktrees later, first checkpoint the shared foundation in Git; never copy .env or credentials.

## Local frontend

Requires Node >=22.12. Install with `npm ci`, copy `.env.example` to `.env.local`, and run `npm run dev`. If npm 10 crashes in its peer dependency resolver, use npm 11 (`npx --yes npm@11.6.2 ci`). Dependencies are locked in package-lock.json.

- `npm run typecheck`: shared and frontend TypeScript.
- `npm test`: real PostgreSQL-in-WASM migrations/RLS/booking tests, HTTP handler tests, calendar/phone/token helpers, and any customer tests.
- `npm run build`: typecheck and production bundle.
- `npm run check`: all three gates.
- `npm run dev:demo`: explicit, clearly labelled demo with synthetic in-memory appointments; no cloud credentials needed.
- `npm run test:browser`: desktop/mobile Playwright booking lifecycle and automated accessibility tests. Install its browser once with `npx playwright install chromium`.
- `VITE_API_MODE=fixtures`: development-only, in-memory synthetic UI fixtures. Clearly label fixture appointments as tests. Production builds always use live APIs.
- Missing live environment variables produce `NOT_CONFIGURED`; no automatic demo fallback.

Browser variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_API_MODE`. Never expose service-role, CAPTCHA secret, LINE or SMS credentials using `VITE_*`.

## Supabase setup

Use a **new dedicated project**. Locally, install/run the Supabase CLI with `npx supabase` and start Docker before `npx supabase start`. `npx supabase db reset` rebuilds only your disposable local database and applies migrations plus the safe seed; do not use reset against production data. For a remote new project, authenticate, link it with `npx supabase link --project-ref YOUR_PROJECT_REF`, review migrations, and run `npx supabase db push`. Load `supabase/seed.sql` explicitly into the new remote project; it uses conflict-safe inserts.

Create staff users through Supabase Auth administration (public signup is disabled locally; disable it in the hosted project too). Insert a matching `staff_profiles` row as an administrator, with role owner or barber; a barber also requires barber_id. Never derive staff permissions from user-editable profile metadata. Staff cannot promote themselves. Authenticated staff have scoped reads; direct browser writes to appointments and scheduling tables are denied. Admin write RPCs are a later stage.

Configure actual services/prices/durations, barbers/capabilities/shifts, and policies before setting online_booking_enabled=true. Default policy values are **provisional**: 4-hour cancellation cutoff, 15-minute start grid, 60-minute minimum notice, 60-day horizon, zero cleanup buffer. Owner confirmation is required before launch. Shop hours are the provided daily 10:30–19:30 in Asia/Bangkok.

Each appointment is consecutive services with one barber. PostgreSQL performs authoritative availability and atomic changes, uses a scheduling transaction lock plus a range exclusion constraint, snapshots service prices/durations/cancellation policy, and records changes. A secure token is generated once per booking intent in the browser and only its hash is stored. Reuse the same idempotency key/token on network retries. Customer data is not merged merely because two unauthenticated callers submit the same phone number.

## Edge Functions

Set server secrets through Supabase project settings or `supabase secrets set --env-file` using a private untracked file. Do not put secret values in command arguments, Git, chat, or screenshots.

| Variable | Value/purpose |
|---|---|
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | Supplied by the Supabase runtime; never sent to browsers |
| APP_ORIGIN | Exact frontend origin, e.g. http://localhost:5173; set production origin before deployment |
| TURNSTILE_SECRET_KEY | Cloudflare Turnstile server secret |
| TURNSTILE_EXPECTED_HOSTNAME | Exact frontend hostname; checked against CAPTCHA result |
| RATE_LIMIT_SALT | Random secret of at least 32 characters for private phone rate-limit keys |

Deploy `catalog`, `availability`, `create-booking`, and `manage-booking` with `npx supabase functions deploy FUNCTION_NAME`. Their guest access configuration is in `supabase/config.toml`; they implement controlled validation rather than requiring customer login. Creation fails closed without Turnstile configuration. The widget action must be `booking`; refresh the single-use CAPTCHA token after each HTTP attempt. Restrict allowed hostnames in the Turnstile dashboard.

Requests are POST JSON with a 16 KiB limit; errors contain stable codes rather than database internals. Creation checks global capacity and a salted phone limit, validates CAPTCHA, and invokes a service-role-only transaction function. Management requires a 256-bit token, and limits attempts by booking plus a global budget. Add gateway abuse controls during production rollout; application limits alone are not a complete anti-abuse service.

`deno check --config supabase/functions/deno.json supabase/functions/catalog/index.ts supabase/functions/availability/index.ts supabase/functions/create-booking/index.ts supabase/functions/manage-booking/index.ts` checks the actual Edge runtime entrypoints. Deno uses the pinned import map. Unit tests execute the handler logic under Node with injected dependencies; they do not verify real Supabase gateway behavior or external CAPTCHA service delivery.

## Test boundaries

PGlite runs the real SQL migrations, exclusion constraint and RLS with a small Auth schema stub. It does **not** simulate concurrent PostgreSQL connections or the complete Supabase service stack. Database tests use isolated synthetic prices and identities that never enter production seed data.

`npm run test:concurrency` uses independent psql processes against a fresh, empty, local database named `hook_menclub_test`. Set TEST_DATABASE_URL privately to that disposable database; the script refuses other hosts/names and nonempty schemas, never drops existing tables, and needs psql plus an administrative test connection. It tests competing slot requests and concurrent retries. The GitHub workflow provisions an isolated PostgreSQL 17 service and runs this gate plus Deno and app checks. **The workflow is prepared, not claimed as executed.**

On Windows without psql, set TEST_PG_CONTAINER to an owned isolated container named `hook-menclub-test-...`; the script uses Docker exec with psql inside that container. TEST_DATABASE_URL must still identify the local disposable `hook_menclub_test` database. It does not need a published network port. Never point tests at the shop's data.

## Notifications and remaining stages

Booking transactions already enqueue confirmation, owner-change and reminder jobs; cancelling or rescheduling invalidates old pending jobs. **No LINE/SMS message is sent yet.** Do not interpret a queued job as successful delivery.

Notification stage: implement one provider interface with LINE and SMS adapters, verified LINE linking/webhook signatures, idempotent delivery, bounded retries and stale-revision checks. Configure a LINE Official Account/channel, channel access token/channel secret, owner recipient, SMS provider credentials and sender. Keep provider secrets server-side. Schedule a worker through Supabase Cron/Vault. Management links in outbound jobs need an encrypted delivery envelope so raw tokens are not stored in plaintext. Add delivery tests with sandbox recipients before enabling production schedules.

Next stages: integrate/test Claude's customer screens; private reference-image uploads and owner gallery management; notifications; authenticated admin calendar/manual bookings/catalog/schedule/customer management; reporting/exports; verified privacy-request processing; SEO/prerendering and deployment. The schema reserves privacy/review/channel tables, but their complete workflows are not implemented yet. Optional queue/deposit/loyalty/voucher/product/waitlist flags default off; flags alone are not implementations.

## Deployment and launch

`vercel.json` prepares static output and SPA routes. Import the repository into Vercel with browser-safe variables and set the matching APP_ORIGIN in Supabase. This stage does not deploy or create any cloud resources. The development page has noindex; remove it only when real pages, policies and content are ready and SEO checks pass.

Before launch: full Supabase integration and concurrent-session gates; provider sandbox delivery; verified business content and cancellation policy; role/auth checks; mobile browser/accessibility checks; Lighthouse mobile performance and SEO target >=90; metadata/JSON-LD/sitemap; backup/restore validation; operational monitoring; owner acceptance. These checks are pending unless recorded as run in `docs/CODEX_STATUS.md`.

## References

- [Supabase database functions and function privileges](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL range exclusion constraints](https://www.postgresql.org/docs/17/rangetypes.html)
- [PGlite extensions used by local tests](https://pglite.dev/extensions/)
