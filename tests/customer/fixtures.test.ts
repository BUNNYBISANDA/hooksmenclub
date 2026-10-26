import { describe, expect, it } from 'vitest';
import { fixtureApi } from '../../src/lib/fixtures';
import { createBookingCredentials } from '../../src/lib/booking';

// Fixtures are synthetic development data; these tests only guard the simulated availability the booking UI is demoed with.
const HAIRCUT = '10000000-0000-4000-8000-000000000001';
const SKIN_FADE = '10000000-0000-4000-8000-000000000002';
const KIDS = '10000000-0000-4000-8000-000000000003';
const BARBER_A = '20000000-0000-4000-8000-000000000001';
const BARBER_B = '20000000-0000-4000-8000-000000000002';

/** A Wednesday far enough ahead that minimum notice never hides slots. */
function futureWednesday(): string {
  const d = new Date(Date.now() + 14 * 86400000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('fixture catalog', () => {
  it('offers example services and four example barbers, all flagged as placeholders', async () => {
    const catalog = await fixtureApi.getCatalog();
    expect(catalog.services.length).toBeGreaterThanOrEqual(6);
    expect(catalog.barbers).toHaveLength(4);
    expect([...catalog.services, ...catalog.barbers].every((x) => x.isPlaceholder)).toBe(true);
  });
});

describe('fixture availability', () => {
  it('differs per barber and only offers barbers who do every selected service', async () => {
    const date = futureWednesday();
    const any = await fixtureApi.getAvailability({ serviceIds: [SKIN_FADE], barberId: null, date });
    expect(any.slots.length).toBeGreaterThan(0);
    // Barber B does not offer skin fades, so B never appears.
    expect(any.slots.every((s) => !s.barberIds.includes(BARBER_B))).toBe(true);

    const onlyA = await fixtureApi.getAvailability({ serviceIds: [SKIN_FADE], barberId: BARBER_A, date });
    expect(onlyA.slots.every((s) => s.barberIds.length === 1 && s.barberIds[0] === BARBER_A)).toBe(true);
    expect(onlyA.slots.length).toBeLessThanOrEqual(any.slots.length);
  });

  it('rejects a service the barber cannot do', async () => {
    const result = await fixtureApi.getAvailability({ serviceIds: [KIDS], barberId: BARBER_A, date: futureWednesday() });
    expect(result.slots).toEqual([]);
  });

  it('never offers a slot that runs past closing', async () => {
    const { slots } = await fixtureApi.getAvailability({ serviceIds: [SKIN_FADE], barberId: null, date: futureWednesday() });
    const closing = Date.parse(`${futureWednesday()}T19:30:00+07:00`);
    expect(slots.every((s) => Date.parse(s.endsAt) <= closing)).toBe(true);
  });
});

describe('fixture booking', () => {
  it('removes the booked slot for that barber and rejects a second booking of it', async () => {
    const date = futureWednesday();
    const before = await fixtureApi.getAvailability({ serviceIds: [HAIRCUT], barberId: BARBER_A, date });
    const slot = before.slots[before.slots.length - 1];
    const credentials = createBookingCredentials();
    const result = await fixtureApi.createBooking({
      serviceIds: [HAIRCUT], barberId: BARBER_A, startsAt: slot.startsAt,
      customer: { name: 'Test', phone: '0812345678', locale: 'en', marketingOptIn: false },
      turnstileToken: 'x', idempotencyKey: credentials.idempotencyKey, manageToken: credentials.manageToken,
    });
    expect(result.booking.barber.id).toBe(BARBER_A);
    expect(result.booking.totalBaht).toBe(250);

    const after = await fixtureApi.getAvailability({ serviceIds: [HAIRCUT], barberId: BARBER_A, date });
    expect(after.slots.some((s) => s.startsAt === slot.startsAt)).toBe(false);

    const second = createBookingCredentials();
    await expect(fixtureApi.createBooking({
      serviceIds: [HAIRCUT], barberId: BARBER_A, startsAt: slot.startsAt,
      customer: { name: 'Other', phone: '0899999999', locale: 'en', marketingOptIn: false },
      turnstileToken: 'x', idempotencyKey: second.idempotencyKey, manageToken: second.manageToken,
    })).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  });
});
