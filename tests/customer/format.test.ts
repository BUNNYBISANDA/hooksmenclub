import { describe, expect, it } from 'vitest';
import { addDays, bangkokDateOf, bangkokToday, formatDateTime, formatTime, weekdayName, weekdayOf } from '../../src/locales';
import { buildDateOptions, firstOpenDate } from '../../src/components/customer/dates';

describe('Asia/Bangkok formatting', () => {
  it('renders instants in Bangkok time regardless of device zone', () => {
    expect(formatTime('2026-10-19T03:30:00.000Z')).toBe('10:30');
    expect(formatTime('2026-10-19T12:30:00.000Z')).toBe('19:30');
    expect(formatTime('2026-10-19T17:00:00.000Z')).toBe('00:00');
  });

  it('rolls the Bangkok calendar day forward at 17:00 UTC', () => {
    expect(bangkokToday(Date.parse('2026-10-18T16:59:59Z'))).toBe('2026-10-18');
    expect(bangkokToday(Date.parse('2026-10-18T17:00:00Z'))).toBe('2026-10-19');
    expect(bangkokDateOf('2026-10-18T17:30:00Z')).toBe('2026-10-19');
  });

  it('does date arithmetic across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2023-01-01')).toBe(0);
    expect(weekdayOf('2026-10-19')).toBe(1);
  });

  it('names weekdays in both locales with 0 = Sunday', () => {
    expect(weekdayName('en', 0)).toBe('Sunday');
    expect(weekdayName('th', 0)).toBe('วันอาทิตย์');
    expect(weekdayName('en', 6)).toBe('Saturday');
  });

  it('formats date and time together', () => {
    expect(formatDateTime('2026-10-19T03:30:00.000Z', 'en')).toContain('10:30');
    expect(formatDateTime('2026-10-19T03:30:00.000Z', 'th')).toContain('10:30');
  });
});

describe('date options', () => {
  const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: '10:30', closes: '19:30', closed: weekday === 1 }));

  it('starts today (Bangkok), honours the horizon and marks closed weekdays', () => {
    const now = Date.parse('2026-10-18T10:00:00Z'); // Sunday in Bangkok
    const options = buildDateOptions({ bookingHorizonDays: 10, hours }, now);
    expect(options).toHaveLength(10);
    expect(options[0]).toEqual({ date: '2026-10-18', closed: false, isToday: true });
    expect(options[1]).toMatchObject({ date: '2026-10-19', closed: true });
    expect(firstOpenDate(options)).toBe('2026-10-18');
    expect(firstOpenDate(options.map((o) => ({ ...o, closed: true })))).toBeNull();
  });

  it('returns nothing for a zero or negative horizon', () => {
    expect(buildDateOptions({ bookingHorizonDays: 0, hours })).toEqual([]);
    expect(buildDateOptions({ bookingHorizonDays: -3, hours })).toEqual([]);
  });
});
