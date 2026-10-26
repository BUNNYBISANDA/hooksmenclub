import { describe,expect,it } from 'vitest';
import { createBookingCredentials,createCalendarFile,makeManageUrl,normalizeThaiPhone } from '../src/lib/booking';

describe('customer booking helpers',()=>{
  it.each(['081 234 5678','081-234-5678','+66812345678','66812345678'])('normalizes Thai phone %s',value=>{expect(normalizeThaiPhone(value)).toBe('+66812345678');});
  it('accepts a Bangkok landline and rejects malformed numbers',()=>{
    expect(normalizeThaiPhone('02 123 4567')).toBe('+6621234567');
    for(const value of ['12345','081234567890','+18123456789','081<script>','0012345678']) expect(()=>normalizeThaiPhone(value)).toThrow('INVALID_INPUT');
  });
  it('uses random URL-safe tokens and keeps them in link fragments',()=>{
    const one=createBookingCredentials(),two=createBookingCredentials();expect(one.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(one.manageToken).not.toBe(two.manageToken);
    const url=new URL(makeManageUrl(one.idempotencyKey,one.manageToken,'https://example.test'));
    expect(url.search).toBe('');expect(url.hash).toContain(one.manageToken);expect(url.pathname).toBe('/manage');
  });
  it('writes a UTC calendar with valid UTF-8 folding and no private fields',()=>{
    const ics=createCalendarFile({id:'test-id',startsAt:'2030-01-01T10:30:00+07:00',endsAt:'2030-01-01T11:00:00+07:00'},new Date('2026-10-18T00:00:00Z'));
    expect(ics).toContain('DTSTART:20300101T033000Z');expect(ics).toContain('DTEND:20300101T040000Z');expect(ics).toContain('DTSTAMP:20261018T000000Z');
    expect(ics.split('\r\n').every(line=>new TextEncoder().encode(line).length<=75)).toBe(true);
    expect(ics).not.toContain('token=');expect(ics.endsWith('\r\n')).toBe(true);
  });
});
