import { useEffect, useMemo } from 'react';
import type { Barber, CustomerApi, Locale, ShopSettings, Slot } from '../../types/api';
import { formatDay, formatDayParts, formatTime, getCopy, weekdayOf } from '../../locales';
import { buildDateOptions } from './dates';
import { useAvailability } from './hooks';
import { Button, ErrorNotice, choiceCard } from './ui';

interface Props {
  api: CustomerApi;
  locale: Locale;
  shop: Pick<ShopSettings, 'bookingHorizonDays' | 'hours' | 'slotStepMinutes'>;
  barbers: Barber[];
  serviceIds: string[];
  /** Total length of the selected services, when every duration is known. Used only to decide which grid times could ever fit before closing. */
  durationMinutes: number | null;
  barberId: string | null;
  date: string;
  onDateChange: (date: string) => void;
  /** Selected slot start (ISO UTC) or null. */
  selected: string | null;
  onSelect: (slot: Slot | null) => void;
  /** Called when a previously selected slot disappears from a fresh server response. */
  onSelectionLost?: () => void;
  refreshToken: number;
  onRefresh: () => void;
  idPrefix: string;
}

interface Cell { startsAt: string; slot: Slot | null }

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Day strip + every time of the day, marked available or unavailable.
 * Availability itself always comes from `api.getAvailability`; the grid only adds the times the server did not offer
 * (booked, on break, off shift, too soon), so customers can see the whole day rather than a short list.
 */
export function SlotPicker({ api, locale, shop, barbers, serviceIds, durationMinutes, barberId, date, onDateChange, selected, onSelect, onSelectionLost, refreshToken, onRefresh, idPrefix }: Props) {
  const copy = getCopy(locale);
  const options = useMemo(() => buildDateOptions(shop), [shop]);
  const availability = useAvailability(api, serviceIds.length ? { serviceIds, barberId, date } : null, refreshToken);
  const slots = availability.status === 'ready' ? availability.data.slots : null;

  useEffect(() => {
    if (!slots || !selected) return;
    if (!slots.some((s) => s.startsAt === selected)) {
      onSelect(null);
      onSelectionLost?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, selected]);

  const cells = useMemo<Cell[]>(() => {
    if (!slots) return [];
    const hours = shop.hours.find((h) => h.weekday === weekdayOf(date));
    const byStart = new Map(slots.map((s) => [s.startsAt, s]));
    const out = new Map<string, Cell>();
    if (hours && !hours.closed && shop.slotStepMinutes > 0) {
      const need = durationMinutes ?? shop.slotStepMinutes;
      for (let m = toMinutes(hours.opens); m + need <= toMinutes(hours.closes); m += shop.slotStepMinutes) {
        const startsAt = new Date(Date.parse(`${date}T${hhmm(m)}:00+07:00`)).toISOString();
        out.set(startsAt, { startsAt, slot: byStart.get(startsAt) ?? null });
      }
    }
    for (const s of slots) out.set(s.startsAt, { startsAt: s.startsAt, slot: s });
    return [...out.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [slots, shop, date, durationMinutes]);

  if (!serviceIds.length) return <p className="rounded-sm border border-dashed border-ink/25 p-4 text-muted">{copy.booking.pickServiceFirst}</p>;

  const open = cells.filter((c) => c.slot).length;
  const groups = [
    { key: 'morning', label: copy.booking.periodMorning, cells: cells.filter((c) => Number(formatTime(c.startsAt).slice(0, 2)) < 12) },
    { key: 'afternoon', label: copy.booking.periodAfternoon, cells: cells.filter((c) => { const h = Number(formatTime(c.startsAt).slice(0, 2)); return h >= 12 && h < 17; }) },
    { key: 'evening', label: copy.booking.periodEvening, cells: cells.filter((c) => Number(formatTime(c.startsAt).slice(0, 2)) >= 17) },
  ].filter((g) => g.cells.length);
  const selectedSlot = slots?.find((s) => s.startsAt === selected) ?? null;
  const clock = copy.common.clockSuffix ? ` ${copy.common.clockSuffix}` : '';

  return (
    <div className="space-y-6">
      <fieldset className="min-w-0">
        <legend className="mb-2 font-bold">{copy.booking.dateGroup}</legend>
        <div className="hm-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {options.map((o) => {
            const p = formatDayParts(o.date, locale);
            return (
              <label key={o.date} className={`${choiceCard} min-w-[4.5rem] shrink-0 flex-col items-center !p-2 text-center has-[:checked]:!bg-ink has-[:checked]:!text-paper has-[:checked]:[&_span]:!text-paper`}>
                <input
                  type="radio"
                  name={`${idPrefix}-date`}
                  value={o.date}
                  checked={o.date === date}
                  disabled={o.closed}
                  onChange={() => { onDateChange(o.date); onSelect(null); }}
                  className="hm-sr-only"
                />
                <span className="text-xs text-muted">{o.isToday ? copy.booking.dayToday : p.weekday}</span>
                <span className="hm-display text-2xl leading-tight">{p.day}</span>
                <span className="text-xs text-muted">{o.closed ? copy.booking.dayClosed : p.month}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p role="status" aria-live="polite" className="text-sm font-medium text-ink">
            {availability.status === 'loading' ? copy.booking.slotsLoading : slots ? copy.booking.availableOf(open, cells.length) : ''}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
            <li className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-sm border border-ink/30 bg-panel" />{copy.booking.legendAvailable}</li>
            <li className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-sm border border-ink/10 bg-ink/[0.06]" />{copy.booking.legendUnavailable}</li>
            <li className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-sm bg-ink" />{copy.booking.legendSelected}</li>
          </ul>
        </div>

        {availability.status === 'error' ? (
          <ErrorNotice copy={copy} code={availability.code} extra={<p className="mt-1 font-medium">{copy.booking.slotsErrorTitle}</p>} actions={<Button variant="ghost" onClick={onRefresh}>{copy.common.retry}</Button>} />
        ) : null}

        {availability.status === 'loading' ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-sm bg-ink/[0.06] motion-reduce:animate-none" />)}
          </div>
        ) : null}

        {slots && open === 0 ? (
          <div className="mb-4 rounded-sm border border-dashed border-ink/25 p-4" role="status">
            <p className="font-bold">{copy.booking.slotsEmptyTitle}</p>
            <p className="text-sm text-muted">{copy.booking.slotsEmptyBody}</p>
          </div>
        ) : null}

        {groups.map((g) => (
          <fieldset key={g.key} className="mb-5 min-w-0">
            <legend className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brass [&:lang(th)]:text-sm [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal">{g.label}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {g.cells.map(({ startsAt, slot }) => {
                const time = `${formatTime(startsAt)}${clock}`;
                if (!slot) {
                  return (
                    <label key={startsAt} className="flex min-h-12 cursor-not-allowed select-none flex-col items-center justify-center rounded-sm border border-ink/10 bg-ink/[0.06] px-1 py-1.5 text-center text-ink/40">
                      <input type="radio" name={`${idPrefix}-slot`} value={startsAt} disabled checked={false} readOnly className="hm-sr-only" aria-label={`${time} — ${copy.booking.slotTaken}`} />
                      <span aria-hidden="true" className="font-bold line-through decoration-ink/30">{time}</span>
                    </label>
                  );
                }
                return (
                  <label key={startsAt} className="flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-sm border border-ink/25 bg-panel px-1 py-1.5 text-center transition-colors hover:border-brass hover:bg-sand has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brass">
                    <input type="radio" name={`${idPrefix}-slot`} value={startsAt} checked={startsAt === selected} onChange={() => onSelect(slot)} className="hm-sr-only" />
                    <span className="font-bold">{time}</span>
                    {barberId === null && barbers.length > 1 ? <span className="text-[0.7rem] leading-tight opacity-70">{copy.booking.freeBarbers(slot.barberIds.length)}</span> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {selectedSlot && barberId === null ? (
          <p className="rounded-sm bg-sand px-4 py-3 text-sm" role="status">
            <span className="font-bold">{copy.booking.freeBarbersFor(formatTime(selectedSlot.startsAt))}: </span>
            {selectedSlot.barberIds.map((id) => barbers.find((b) => b.id === id)?.name[locale]).filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <p className="sr-only">{formatDay(date, locale)}</p>
      </div>
    </div>
  );
}
