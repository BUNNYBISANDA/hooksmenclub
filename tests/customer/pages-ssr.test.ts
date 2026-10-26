import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BookingView, CustomerApi, Locale } from '../../src/types/api';
import { BookingPage } from '../../src/features/booking/BookingPage';
import { ConfirmationPage } from '../../src/features/booking/ConfirmationPage';
import { HomePage } from '../../src/features/public-site/HomePage';
import { ManageBookingPage } from '../../src/features/manage-booking/ManageBookingPage';

// Static server render: effects do not run, so these cover the first paint and the recovery/invalid states only.
const never = () => new Promise<never>(() => {});
const api: CustomerApi = { getCatalog: never, getAvailability: never, createBooking: never, getBooking: never, cancelBooking: never, rescheduleBooking: never };

const booking: BookingView = {
  id: '3f2b8c1e-5d4a-4b7c-9e0f-1a2b3c4d5e6f', reference: 'HM-TEST-1', status: 'confirmed', startsAt: '2026-10-19T03:30:00.000Z', endsAt: '2026-10-19T04:00:00.000Z',
  barber: { id: 'b', name: { th: 'ช่างทดสอบ', en: 'TEST barber' } }, services: [{ id: 's', name: { th: 'บริการทดสอบ', en: 'TEST service' }, priceBaht: 0, durationMinutes: 30 }],
  customerName: 'Somchai', totalBaht: 0, cancellationDeadline: '2026-10-18T23:30:00.000Z', canChange: true, revision: 1,
};
const token = 'T'.repeat(43);

function render(page: typeof HomePage, locale: Locale, entry: string | { pathname: string; state?: unknown; hash?: string }) {
  return renderToString(createElement(MemoryRouter, { initialEntries: [entry as never] }, createElement(page, { api, locale, onLocaleChange: () => {} })));
}

const g = globalThis as unknown as { window?: unknown };
const hadWindow = 'window' in g;
beforeAll(() => { if (!hadWindow) g.window = { location: { origin: 'https://example.test' } }; });
afterAll(() => { if (!hadWindow) delete g.window; });

describe('customer pages (first paint)', () => {
  it.each(['th', 'en'] as const)('home shows loading skeletons and the verbatim facts (%s)', (locale) => {
    const html = render(HomePage, locale, '/');
    expect(html).toContain('Hook');
    expect(html).toContain('099 059 2205');
    expect(html).toContain('888/88 โครงการเจ้าสัว 69 ถ.บางบอน 3');
    expect(html).toContain(`lang="${locale}"`);
    expect(html).not.toMatch(/localStorage|undefined|NaN/);
  });

  it('booking page shows a loading state, not a form, before the catalog arrives', () => {
    const html = render(BookingPage, 'en', '/book');
    expect(html).toContain('Loading services');
    expect(html).not.toContain('<form');
  });

  it('confirmation without router state is a recovery screen, never a fake success', () => {
    for (const locale of ['th', 'en'] as const) {
      const html = render(ConfirmationPage, locale, '/confirmation');
      expect(html).toContain(locale === 'th' ? 'ไม่พบข้อมูลการจองในหน้านี้' : 'No booking found on this page');
      expect(html).not.toContain(locale === 'th' ? 'จองสำเร็จ' : 'Booking confirmed');
    }
  });

  it('confirmation rejects malformed router state', () => {
    const html = render(ConfirmationPage, 'en', { pathname: '/confirmation', state: { booking: { id: 'x' }, manageToken: 't', mode: 'live' } });
    expect(html).toContain('No booking found on this page');
  });

  it('live confirmation shows the booking, manage link in the fragment, and a calendar button', () => {
    const html = render(ConfirmationPage, 'en', { pathname: '/confirmation', state: { booking, manageToken: token, mode: 'live' } });
    expect(html).toContain('Booking confirmed');
    expect(html).toContain('HM-TEST-1');
    expect(html).toContain(`https://example.test/manage#booking=${booking.id}&amp;token=${token}`);
    expect(html).not.toContain('?token=');
    expect(html).toContain('Add to calendar');
    expect(html).not.toContain('NOT A REAL APPOINTMENT');
  });

  it('fixtures confirmation is stamped as test-only and offers no calendar file', () => {
    const html = render(ConfirmationPage, 'th', { pathname: '/confirmation', state: { booking, manageToken: token, mode: 'fixtures' } });
    expect(html).toContain('TEST — NOT A REAL APPOINTMENT');
    expect(html).toContain('การจองจำลอง');
    expect(html).not.toContain('เพิ่มลงปฏิทิน (.ics)</button>');
  });

  it('manage page without a valid fragment asks the customer to reopen the original link', () => {
    for (const hash of [undefined, '#booking=bad&token=bad']) {
      const html = render(ManageBookingPage, 'en', { pathname: '/manage', ...(hash ? { hash } : {}) });
      expect(html).toContain('This link is invalid or was already used');
      expect(html).not.toContain('Cancel appointment');
    }
  });

  it('manage page with a valid fragment starts in a loading state', () => {
    const html = render(ManageBookingPage, 'th', { pathname: '/manage', hash: `#booking=${booking.id}&token=${token}` });
    expect(html).toContain('กำลังโหลดการจองของคุณ');
    expect(html).not.toContain(token);
  });
});
