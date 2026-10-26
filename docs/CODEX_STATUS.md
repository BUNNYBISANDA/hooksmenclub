# Backend checkpoint — 18 October 2026

## Implemented

- React/Vite/TypeScript/Tailwind scaffold; original demo preserved.
- Claude handoff, customer API contracts, live client, clearly synthetic development adapter, secure-link/phone/calendar helpers.
- Supabase schema, role-scoped reads, protected mutation functions, safe owner-editable placeholder seed.
- Database availability, booking creation, token-authenticated management, atomic cancellation/rescheduling, retry deduplication, exclusion constraint and transaction locking.
- Four Edge Function handlers with validation, CAPTCHA verification, bounded body size, rate limits, no-store responses and stable error mapping.
- Transactional notification outbox only; delivery is not implemented.
- Setup guide, Vercel build configuration, CI and separate-session PostgreSQL test script.

## Local verification

- 39 tests passed at the backend checkpoint: PostgreSQL-in-WASM/RLS/booking lifecycle, server handler boundaries, calendar/phone/token helpers.
- TypeScript check and Vite production build passed.
- After Claude's five customer test files appeared, the combined rerun reached 70 passing tests but the database worker failed to allocate memory (21 database cases did not complete). A reduced-parallelism retry also hit process allocation failure. The latest complete-suite verification is therefore **incomplete**, not green. Earlier 39 backend/helper checks remain the last successful backend checkpoint. `vitest.config.ts` now limits workers to one to reduce pressure on developer machines.
- Docker daemon is not running; full Supabase and separate PostgreSQL sessions have not run locally.
- Deno runtime check could not run: temporary Deno download failed with ENOSPC (approximately 12 MB free on C: at observation). Cleanup of task-created npm temporary directories was blocked by automatic policy review; no user files were removed. Free disk space and system memory before rerunning `npm run check`, the separate-session test and Deno check.
- CI has not run; external providers, deployment and Lighthouse are unverified.

## Handoff to customer frontend

Read `docs/API_CONTRACT.md` and use exported `CustomerApi`. `STALE_BOOKING` is part of the final v1 error union. Shared helper `createCalendarFile` returns an ICS string; create a text/calendar Blob for downloading. `makeManageUrl` keeps credentials in a fragment. `createBookingCredentials` returns one submission's stable retry credentials. ApiError is exported from src/lib/api.ts. No direct Supabase table access in customer components.

Codex has not modified Claude-owned files. Customer screens can be integrated after `docs/CLAUDE_FRONTEND_STATUS.md` is ready and full project checks pass. Current app route intentionally remains a development screen until that integration.

## Next backend work

Complete live Supabase integration, reference uploads, message delivery, staff admin and privacy workflows in the agreed staged order. Do not describe the foundation as a deployed or enterprise-ready application. Owner policy/content and account credentials are still needed for launch, not for ongoing local UI development.

## Update — 18 October 2026 (after disk space freed)

- `npm run check` is green: typecheck, 91/91 tests (database, handlers, helpers, customer), production build. This supersedes the incomplete run above.
- `deno check` of all four Edge Function entrypoints passes (Deno 2.9.6 via npx).
- Customer pages (Home, Booking, Confirmation, Manage) are now routed in `src/app/App.tsx`; unknown routes redirect to `/`. Language choice persists in localStorage.
- Still unverified: Docker/Supabase local stack, `npm run test:concurrency`, CI, browser/mobile/accessibility checks, Lighthouse, providers, deployment.
