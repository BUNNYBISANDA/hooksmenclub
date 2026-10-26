import { createCalendarFile } from '../../lib/booking';

/** Offers the .ics as a local download. The file holds no personal data and no manage link (see createCalendarFile). */
export function downloadCalendarFile(booking: { id: string; startsAt: string; endsAt: string }): void {
  const blob = new Blob([createCalendarFile(booking)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hook-menclub-booking.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
