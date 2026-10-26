import { describe, expect, it } from 'vitest';
import type { Barber, GalleryItem } from '../../src/types/api';
import { createCredentialSession, eligibleBarbers, isConfirmationState, reconcileBarber, submissionSignature, toggleService, validateBooking, type CustomerForm } from '../../src/features/booking/selection';
import { parseManageFragment } from '../../src/features/manage-booking/fragment';
import { groupGallery } from '../../src/features/public-site/sections';

const barber = (id: string, serviceIds: string[]): Barber => ({ id, name: { th: id, en: id }, specialties: { th: '', en: '' }, photoUrl: null, serviceIds, isPlaceholder: true });
const form: CustomerForm = { name: 'Somchai', phone: '081 234 5678', note: '', marketingOptIn: false };

describe('service and barber selection', () => {
  it('toggles services on and off', () => {
    expect(toggleService([], 'a')).toEqual(['a']);
    expect(toggleService(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('only offers barbers who do every selected service', () => {
    const barbers = [barber('x', ['a', 'b']), barber('y', ['a']), barber('z', [])];
    expect(eligibleBarbers(barbers, [])).toEqual([]);
    expect(eligibleBarbers(barbers, ['a']).map((b) => b.id)).toEqual(['x', 'y']);
    expect(eligibleBarbers(barbers, ['a', 'b']).map((b) => b.id)).toEqual(['x']);
    expect(eligibleBarbers(barbers, ['c'])).toEqual([]);
  });

  it('drops a chosen barber who no longer fits the selection', () => {
    const barbers = [barber('x', ['a', 'b']), barber('y', ['a'])];
    expect(reconcileBarber('y', barbers, ['a'])).toBe('y');
    expect(reconcileBarber('y', barbers, ['a', 'b'])).toBeNull();
    expect(reconcileBarber(null, barbers, ['a'])).toBeNull();
  });
});

describe('validation', () => {
  const ok = { serviceIds: ['a'], slotStartsAt: '2026-10-19T03:30:00.000Z', form, captchaOk: true };

  it('accepts a valid Thai mobile and normalises it', () => {
    const r = validateBooking(ok);
    expect(r.errors).toEqual({});
    expect(r.phone).toBe('+66812345678');
  });

  it('reports every missing piece at once', () => {
    const r = validateBooking({ serviceIds: [], slotStartsAt: null, form: { ...form, name: '  ', phone: '' }, captchaOk: false });
    expect(r.errors).toEqual({ service: 'serviceRequired', slot: 'slotRequired', name: 'nameRequired', phone: 'phoneRequired', captcha: 'captchaRequired' });
  });

  it('rejects malformed phones and over-long text', () => {
    expect(validateBooking({ ...ok, form: { ...form, phone: '12345' } }).errors.phone).toBe('phoneInvalid');
    expect(validateBooking({ ...ok, form: { ...form, name: 'x'.repeat(101) } }).errors.name).toBe('nameTooLong');
    expect(validateBooking({ ...ok, form: { ...form, note: 'x'.repeat(501) } }).errors.note).toBe('noteTooLong');
  });
});

describe('submission credentials', () => {
  const base = { serviceIds: ['b', 'a'], barberId: null, startsAt: '2026-10-19T03:30:00.000Z', name: 'Somchai', phone: '+66812345678', note: '', marketingOptIn: false, locale: 'th' as const };

  it('reuses one idempotency key and manage token for an unchanged submission (network retry)', () => {
    const session = createCredentialSession();
    const first = session.resolve(submissionSignature(base));
    const retry = session.resolve(submissionSignature({ ...base, serviceIds: ['a', 'b'], name: ' Somchai ' }));
    expect(retry).toEqual(first);
  });

  it('issues new credentials when any booking input changes', () => {
    const changes = [{ startsAt: '2026-10-19T04:00:00.000Z' }, { barberId: 'x' }, { serviceIds: ['a'] }, { phone: '+66899999999' }, { note: 'fade' }, { marketingOptIn: true }, { name: 'Other' }];
    for (const change of changes) {
      const session = createCredentialSession();
      const first = session.resolve(submissionSignature(base));
      expect(session.resolve(submissionSignature({ ...base, ...change })), JSON.stringify(change)).not.toEqual(first);
    }
  });

  it('issues new credentials after rotate()', () => {
    const session = createCredentialSession();
    const sig = submissionSignature(base);
    const first = session.resolve(sig);
    session.rotate();
    expect(session.resolve(sig)).not.toEqual(first);
  });

  it('generates 32-byte base64url tokens and uuid keys', () => {
    const { manageToken, idempotencyKey } = createCredentialSession().resolve('x');
    expect(manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('manage-link fragment', () => {
  const id = '3f2b8c1e-5d4a-4b7c-9e0f-1a2b3c4d5e6f';
  const token = 'A'.repeat(43);

  it('parses a well-formed fragment', () => {
    expect(parseManageFragment(`#booking=${id}&token=${token}`)).toEqual({ bookingId: id, token });
    expect(parseManageFragment(`booking=${id}&token=${token}`)).toEqual({ bookingId: id, token });
  });

  it.each(['', '#', `#booking=${id}`, `#token=${token}`, `#booking=nope&token=${token}`, `#booking=${id}&token=short`, `#booking=${id}&token=${token}%20`])('rejects %j', (hash) => {
    expect(parseManageFragment(hash)).toBeNull();
  });
});

describe('confirmation router state guard', () => {
  const booking = { id: 'i', reference: 'r', status: 'confirmed', startsAt: 's', endsAt: 'e', services: [] };

  it('accepts complete state and rejects anything else', () => {
    expect(isConfirmationState({ booking, manageToken: 't', mode: 'live' })).toBe(true);
    expect(isConfirmationState({ booking, manageToken: 't', mode: 'fixtures' })).toBe(true);
    expect(isConfirmationState(null)).toBe(false);
    expect(isConfirmationState({ booking, manageToken: '', mode: 'live' })).toBe(false);
    expect(isConfirmationState({ booking, manageToken: 't', mode: 'demo' })).toBe(false);
    expect(isConfirmationState({ manageToken: 't', mode: 'live' })).toBe(false);
  });
});

describe('gallery grouping', () => {
  const item = (id: string, pairId: string | null): GalleryItem => ({ id, imageUrl: null, caption: { th: id, en: id }, category: 'haircut', pairId, isPlaceholder: true });

  it('keeps before/after pairs together and singles alone', () => {
    const groups = groupGallery([item('1', null), item('2', 'p'), item('3', null), item('4', 'p')]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['1'], ['2', '4'], ['3']]);
  });
});
