# Customer API v1 — implementation contract

The source of truth is `src/types/api.ts`. Import types from it, not a copied interface. `src/lib/api.ts` exports `customerApi` and `ApiError`; `src/lib/booking.ts` exports `createBookingCredentials`, `makeManageUrl`, `createCalendarFile`, and `normalizeThaiPhone`.

## Customer interface

All methods return the typed data directly or throw `ApiError` with `code` and `status`. HTTP is POST JSON to Supabase `/functions/v1/{endpoint}`, success `{ data: T }`, error `{ error: { code: ApiErrorCode } }`. Do not display raw server exceptions. Do not fetch private tables directly. UTC ISO instants are formatted in Asia/Bangkok, never the device timezone. API `date` is YYYY-MM-DD in Bangkok; weekday 0 = Sunday.

| Method | Endpoint | Input |
|---|---|---|
| getCatalog(signal?) | catalog | `{}` |
| getAvailability(input, signal?) | availability | serviceIds (1–8 unique UUIDs), barberId (UUID or null), date |
| getAvailability with management context | manage-booking | `{ action: 'availability', bookingId, token, date, barberId }` |
| createBooking(input) | create-booking | See CreateBookingRequest; Turnstile action `booking` |
| getBooking(input) | manage-booking | `{ action: 'read', bookingId, token }` |
| cancelBooking(input) | manage-booking | `{ action: 'cancel', bookingId, token, expectedRevision, reason? }` |
| rescheduleBooking(input) | manage-booking | `{ action: 'reschedule', bookingId, token, expectedRevision, startsAt, barberId }` |

`getAvailability` returns grouped slots with eligible barber IDs; the backend assigns one eligible barber at submission if barberId is null. A slot is not a hold. On `SLOT_UNAVAILABLE`, refresh availability and ask for another slot. Empty `slots` is a valid no-availability state. Multiple services are consecutive with the same barber.

`createBookingCredentials()` returns `{idempotencyKey, manageToken}` generated with Web Crypto. Generate ONCE for an unchanged submission and reuse across network retries. Generate anew if any booking input changes. A Turnstile token is single-use: refresh it on every HTTP attempt while preserving the idempotency key and manage token. All personal data and tokens live in component/router memory only; never localStorage, analytics, logs, or fixtures on disk. The server stores only a SHA-256 manage-token hash.

`makeManageUrl(bookingId, token, origin?)` returns `/manage#booking=...&token=...`; the token is in the fragment, not the query. Save/show this link on confirmation. Capture the fragment in memory and remove it with history.replaceState without triggering a remount. The link grants access only to that appointment; never expose customer history. Token expiration is 30 days after the appointment. Revoked/expired/missing tokens all return `INVALID_LINK`.

`BookingView` deliberately omits phone, notes, marketing consent, and other private customer data. The backend returns `cancellationDeadline` and `canChange`. The original booking's cancellation window, prices, durations and buffer are retained for reschedules. The shared routing layer uses `withManagedAvailability(api, link)` to attach optional `AvailabilityRequest.management`. The live client routes these requests through authenticated booking management; SQL uses the original duration/buffer and excludes only that appointment. Customer components keep calling the same getAvailability interface.

The shared router keeps navigation state in an in-memory map. Browser history contains only an opaque navigation key. Do not replace it with BrowserRouter: standard browser routing serializes route state into history.state, which would persist confirmation data and the secret link token. Only the non-sensitive language preference may be saved in localStorage.

Cancellation is idempotent. Successful reschedule retries with the same previous revision and resulting time/barber are idempotent. `STALE_BOOKING` means another change already occurred: reload the appointment before trying again. At the exact cancellation deadline, changes are closed. Failed reschedules roll back and retain the old appointment.

## Error behavior

| Code | UI behavior |
|---|---|
| INVALID_INPUT | Explain invalid/missing fields; retain valid inputs |
| SLOT_UNAVAILABLE | Refresh slots; preserve original booking when managing |
| BOOKING_CLOSED | Explain online booking is unavailable; show phone CTA |
| INVALID_LINK | Ask customer to reopen original link or call the shop |
| CHANGE_WINDOW_CLOSED | Show cutoff and phone CTA |
| BOOKING_NOT_CHANGEABLE | Reload current status and disable changes |
| STALE_BOOKING | Reload current appointment before another mutation |
| RATE_LIMITED | Slow down and retry later; never auto-loop |
| CAPTCHA_FAILED | Reset widget and request verification again |
| IDEMPOTENCY_CONFLICT | Stop retrying altered input with old credentials |
| NOT_CONFIGURED | Show setup/unavailable state; never silently use fixtures |
| NETWORK_ERROR / INTERNAL_ERROR | Preserve inputs, allow explicit retry |

## Development mode

Set `VITE_API_MODE=fixtures` for Claude UI development. It is accepted ONLY with `import.meta.env.DEV`; production never falls back to fixtures. The fixture catalog has visibly synthetic services and barbers with zero test-only prices. The adapter holds synthetic appointments in memory and marks creation `{mode:'fixtures'}`. Display a persistent test-mode notice and `TEST — NOT A REAL APPOINTMENT` on fixture confirmation. It is not an availability engine or a substitute for database tests. Do not put real customer data into it.

Live mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; Turnstile additionally needs VITE_TURNSTILE_SITE_KEY. No secret/service-role key may use a VITE_ prefix. The safe database seed disables online bookings and has nullable prices/durations until the owner configures real offerings.

## Boundaries and staging

Photo upload, LINE account linking, privacy requests, queue, payments, loyalty, vouchers, products, and waitlist are not wired into this API version. Do not show those actions as completed or paid. Catalog/gallery and booking lifecycle are the first integration boundary. Notification outbox entries are queued, not evidence of delivery; never promise a message was delivered until a provider confirms it. Full notification adapters, admin and deployment follow the database/booking stages.
