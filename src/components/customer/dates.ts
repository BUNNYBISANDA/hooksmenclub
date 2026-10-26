import type { ShopSettings } from '../../types/api';
import { addDays, bangkokToday, weekdayOf } from '../../locales/format';

/** Minutes since midnight in Bangkok (UTC+7, no DST). */
const bangkokMinutes = (now: number) => Math.floor((now + 7 * 3600000) / 60000) % 1440;

export interface DateOption { date: string; closed: boolean; isToday: boolean }

/** Days a customer may pick, starting today in Bangkok. `closed` comes from the shop's weekly hours (display only; the server decides availability). */
export function buildDateOptions(shop: Pick<ShopSettings, 'bookingHorizonDays' | 'hours'>, now: number = Date.now()): DateOption[] {
  const today = bangkokToday(now);
  const count = Math.max(0, Math.min(Math.floor(shop.bookingHorizonDays), 120));
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i);
    const hours = shop.hours.find((h) => h.weekday === weekdayOf(date));
    // Today counts as closed once the shop has closed, so the default day is never one with nothing left to book.
    const over = i === 0 && hours !== undefined && !hours.closed && bangkokMinutes(now) >= Number(hours.closes.slice(0, 2)) * 60 + Number(hours.closes.slice(3, 5));
    return { date, closed: (hours ? hours.closed : false) || over, isToday: i === 0 };
  });
}

export function firstOpenDate(options: DateOption[]): string | null {
  return options.find((o) => !o.closed)?.date ?? null;
}
