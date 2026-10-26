import type { Locale } from '../types/api';

/** Asia/Bangkok has no DST and is fixed at UTC+7. Everything shown to customers is rendered in this zone. */
export const TIME_ZONE = 'Asia/Bangkok';
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const intlTag = (locale: Locale) => (locale === 'th' ? 'th-TH' : 'en-GB');

/** YYYY-MM-DD for the current Bangkok calendar day. */
export function bangkokToday(now: number = Date.now()): string {
  return new Date(now + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD calendar date. */
export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function ymdToUtcNoon(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function weekdayName(locale: Locale, weekday: number, style: 'long' | 'short' = 'long'): string {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(intlTag(locale), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + weekday)));
}

/** "จันทร์ 19 ต.ค." style label for a calendar date or an ISO instant. */
export function formatDay(value: string, locale: Locale, withYear = false): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? ymdToUtcNoon(value) : new Date(value);
  const zone = /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : TIME_ZONE;
  return new Intl.DateTimeFormat(intlTag(locale), { weekday: 'long', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: zone }).format(date);
}

export function formatDayParts(ymd: string, locale: Locale): { weekday: string; day: string; month: string } {
  const date = ymdToUtcNoon(ymd);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlTag(locale), { ...o, timeZone: 'UTC' }).format(date);
  return { weekday: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }) };
}

/** 24-hour HH:mm in Bangkok. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: Locale): string {
  return `${formatDay(iso, locale, true)} · ${formatTime(iso)}`;
}

/** The Bangkok calendar date (YYYY-MM-DD) of an ISO instant. */
export function bangkokDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatBaht(amount: number, locale: Locale): string {
  return `฿${new Intl.NumberFormat(intlTag(locale)).format(amount)}`;
}
