import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, getCopy, readErrorCode } from '../../src/locales';
import { en } from '../../src/locales/en';
import { th } from '../../src/locales/th';

function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}:fn`];
  if (Array.isArray(value)) return [`${path}:array(${value.length})`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  return [`${path}:${typeof value}`];
}

function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

describe('Thai/English parity', () => {
  it('has identical keys, array lengths and function slots in both locales', () => {
    expect(shape(en)).toEqual(shape(th));
  });

  it('has no empty strings except the English clock suffix', () => {
    for (const [name, dict] of [['th', th], ['en', en]] as const) {
      const empty = strings(dict).filter(([, s]) => s.trim() === '').map(([p]) => p);
      expect(empty, name).toEqual(name === 'en' ? ['common.clockSuffix'] : []);
    }
  });

  it('keeps the interpolating helpers in sync', () => {
    const faqArgs = { opens: '10:30', closes: '19:30', cancellationHours: 4, horizonDays: 60, noticeMinutes: 60, phone: '099 059 2205', deposits: false };
    const a = th.faq(faqArgs);
    const b = en.faq(faqArgs);
    expect(a.map((i) => Boolean('needsPolicy' in i && i.needsPolicy))).toEqual(b.map((i) => Boolean('needsPolicy' in i && i.needsPolicy)));
    expect(th.policies.terms(4)).toHaveLength(en.policies.terms(4).length);
    for (const dict of [th, en]) {
      expect(dict.faq(faqArgs).some((i) => /undefined|NaN/.test(i.a + i.q))).toBe(false);
    }
  });

  it('writes English copy without Thai characters and Thai copy in Thai', () => {
    const thai = /[฀-๿]/;
    const offenders = strings(en).filter(([p, s]) => thai.test(s) && p !== 'common.toggleLabel').map(([p]) => p);
    expect(offenders).toEqual([]);
    expect(thai.test(th.booking.submit)).toBe(true);
  });

  it('covers every API error code in both locales', () => {
    for (const code of API_ERROR_CODES) {
      for (const locale of ['th', 'en'] as const) {
        const m = getCopy(locale).errors[code];
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.body.length).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(th.errors).sort()).toEqual([...API_ERROR_CODES].sort());
  });
});

describe('readErrorCode', () => {
  it('reads only known codes and never the message', () => {
    expect(readErrorCode({ code: 'SLOT_UNAVAILABLE', message: 'secret-token' })).toBe('SLOT_UNAVAILABLE');
    expect(readErrorCode({ code: 'STALE_BOOKING' })).toBe('STALE_BOOKING');
    expect(readErrorCode({ code: 'SOMETHING_ELSE' })).toBe('INTERNAL_ERROR');
    expect(readErrorCode(new TypeError('fetch failed'))).toBe('NETWORK_ERROR');
    expect(readErrorCode(Object.assign(new Error('x'), { name: 'AbortError' }))).toBeNull();
    expect(readErrorCode('boom')).toBe('INTERNAL_ERROR');
  });
});
