# Hook Menclub: Claude frontend assignment

Codex owns scaffolding, routing, dependencies, shared contracts/adapters, Supabase, admin, and integration. Claude owns customer UI. Read `docs/API_CONTRACT.md` and `src/types/api.ts` before starting. No second booking engine or direct customer/bookings table access.

## Prompt 1 — implementation

Build the customer-facing React + Vite + TypeScript + Tailwind interface for Hook Menclub. Work only in `src/features/public-site/`, `src/features/booking/`, `src/features/manage-booking/`, `src/components/customer/`, `src/locales/`, and customer UI test files under `tests/customer/`. Add a handoff note in `docs/CLAUDE_FRONTEND_STATUS.md`. Do not modify shared routing, configuration, dependencies, styles/base.css, src/lib, src/types, admin, or supabase. Request contract changes in the status note.

Export named `HomePage` from `src/features/public-site/HomePage.tsx`, `BookingPage` and `ConfirmationPage` from matching files in `src/features/booking/`, and `ManageBookingPage` from `src/features/manage-booking/ManageBookingPage.tsx`. Each receives `{ api: CustomerApi; locale: Locale; onLocaleChange: (locale: Locale) => void }`. Use React Router links to `/`, `/book`, `/confirmation`, `/manage`. Confirmation uses in-memory router state `{booking: BookingView, manageToken: string, mode: 'live' | 'fixtures'}`. If state is missing, show a helpful recovery screen, not a fake success. Manage reads booking ID and token from URL fragment `#booking=<uuid>&token=<base64url>`; remove the fragment after capturing it in memory. Do not put tokens in query strings, logs, analytics, localStorage or persistent browser storage. A refresh after removal can ask the user to reopen their original secure link.

Use the existing demo as a visual reference. Make a distinctive charcoal/brass, mobile-first interface with condensed English headings and Sarabun Thai body text, Thai default and full English toggle. Scope styles to customer components or use Tailwind. Cover home, services, barber profiles, gallery, hours/location/map, FAQ, policy draft pages/sections, booking selections and customer details, confirmation/calendar file, and cancellation/rescheduling. Do not invent policy values; show values from the catalog and label unfinished legal copy as a draft.

Use `CustomerApi` methods from the props; shared helpers are in `src/lib/booking.ts`. Preserve one idempotency key and manage token across network retries of an unchanged submission. Generate new credentials if any booking input changes. Never show fixtures as real appointments. Use server slots and `canChange`/`cancellationDeadline`; treat server errors as authoritative. Render all error codes clearly, including concurrent slot loss, stale revision, expired link, and disabled online booking. Implement a Turnstile widget with `VITE_TURNSTILE_SITE_KEY`, action `booking`, and refresh its token after attempts. No bypass in live mode.

Provide loading/empty/error/success states, keyboard access, visible focus, accessible field errors, 44px tap targets, reduced motion, and responsive layouts from 320px. Do not collect reference photos yet: upload API is a later integration and must not be simulated as saved. Use no fake testimonials, prices, barber names, or shop photos. Clearly label placeholders. Do not expose the existing demo's public owner table.

Business facts (verbatim): Hook Menclub; 888/88 โครงการเจ้าสัว 69 ถ.บางบอน 3, แขวงหลักสอง เขตบางแค กรุงเทพฯ 10160; latitude 13.6884457, longitude 100.3824744; phone 099 059 2205; daily 10:30–19:30; Google rating 4.7 from 27 reviews; parking in front of the shop. All date/time presentation uses Asia/Bangkok.

Finish with changed files, checks run, remaining limitations, and required integration changes. Do not deploy or edit the database.

## Prompt 2 — verification

Review the customer frontend against the API contract and fix issues within your assigned files. Check Thai/English parity, narrow mobile layouts, keyboard/focus behavior, empty catalogs, disabled booking, valid multi-service selection, slot changes, retry behavior, expired/invalid links, cutoff handling, and reschedule conflicts. A failed reschedule must preserve and display the original appointment. Verify that tokens and personal information never reach storage, logs, or analytics. Add meaningful customer tests when test infrastructure supports them. Report unavailable browser/API checks honestly. Do not alter shared contracts without agreement.

## Coordination

If using the same working directory, enforce file ownership above. If using separate checkouts, start from the shared foundation snapshot and return a branch/patch touching owned files only. Do not copy node_modules, .env, or secrets between checkouts. Codex integrates customer pages after review.
