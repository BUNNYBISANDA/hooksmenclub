export function normalizeThaiPhone(value: string): string {
  const digits = value.trim().replace(/[\s()-]/g, '');
  const normalized = digits.startsWith('0') ? `+66${digits.slice(1)}` : digits.startsWith('66') ? `+${digits}` : digits;
  // Thai mobile 06/08/09 (10 digits), geographic landline 02–05/07 (9 digits).
  if (!/^\+66(?:[689]\d{8}|[2-57]\d{7})$/.test(normalized)) throw new Error('INVALID_INPUT');
  return normalized;
}

export function createBookingCredentials(): { idempotencyKey: string; manageToken: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const manageToken = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { idempotencyKey: crypto.randomUUID(), manageToken };
}

export function makeManageUrl(bookingId: string, token: string, origin = window.location.origin): string {
  const url = new URL('/manage', origin);
  url.hash = new URLSearchParams({ booking: bookingId, token }).toString();
  return url.toString();
}

/** RFC 5545 escaping + UTF-8 octet folding. No personal data or secure link in calendar content. */
const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function fold(line: string): string {
  let result = '', size = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 75) { result += '\r\n '; size = 1; }
    result += char; size += bytes;
  }
  return result;
}
export function createCalendarFile(booking: { id: string; startsAt: string; endsAt: string }, now = new Date()): string {
  const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hook Menclub//Booking//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${booking.id}@hook-menclub`, `DTSTAMP:${utc(now.toISOString())}`, `DTSTART:${utc(booking.startsAt)}`, `DTEND:${utc(booking.endsAt)}`,
    'SUMMARY:Hook Menclub', `LOCATION:${escapeIcs('888/88 โครงการเจ้าสัว 69 ถ.บางบอน 3, แขวงหลักสอง เขตบางแค กรุงเทพฯ 10160')}`,
    'DESCRIPTION:Hook Menclub - 099 059 2205', 'END:VEVENT', 'END:VCALENDAR', '',
  ].map(fold).join('\r\n');
}
