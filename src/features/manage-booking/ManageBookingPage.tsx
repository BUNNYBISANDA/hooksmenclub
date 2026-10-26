import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { ApiErrorCode, BookingView, CustomerApi, Catalog, Locale, Slot } from '../../types/api';
import { SHOP_FACTS, formatBaht, formatDateTime, getCopy, readErrorCode, telHref, type Copy } from '../../locales';
import { CustomerShell, PageNotice } from '../../components/customer/CustomerShell';
import type { CustomerPageProps } from '../../components/customer/types';
import { useCatalog } from '../../components/customer/hooks';
import { buildDateOptions, firstOpenDate } from '../../components/customer/dates';
import { sumKnown } from '../../components/customer/display';
import { SlotPicker } from '../../components/customer/SlotPicker';
import { downloadCalendarFile } from '../../components/customer/calendar';
import { Button, ButtonAnchor, ButtonLink, ErrorNotice, Field, Notice, Spinner, choiceCard, inputClass } from '../../components/customer/ui';
import { parseManageFragment, type ManageLink } from './fragment';

type View =
  | { phase: 'loading' }
  | { phase: 'invalid' }
  | { phase: 'error'; code: ApiErrorCode }
  | { phase: 'ready'; booking: BookingView };

type Outcome = { kind: 'rescheduled'; previousStartsAt: string } | { kind: 'cancelled' } | { kind: 'refreshed' } | null;
type Panel = 'none' | 'reschedule' | 'cancel';

export function ManageBookingPage({ api, locale, onLocaleChange }: CustomerPageProps) {
  const copy = getCopy(locale);
  const location = useLocation();
  // The secret lives only in this ref/state (memory). It is removed from the address bar right after capture.
  const [link, setLink] = useState<ManageLink | null>(() => parseManageFragment(location.hash));

  useEffect(() => {
    if (!location.hash) return;
    const parsed = parseManageFragment(location.hash);
    if (parsed) setLink((current) => (current && current.bookingId === parsed.bookingId && current.token === parsed.token ? current : parsed));
    // replaceState (not navigate) so the page does not remount; history.state is preserved.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, [location.hash]);

  const catalog = useCatalog(api);
  const ready = catalog.status === 'ready' ? catalog.data : null;
  const phone = ready?.shop.phone ?? SHOP_FACTS.phone;

  return (
    <CustomerShell locale={locale} onLocaleChange={onLocaleChange} title={copy.manage.title} mode={ready?.mode} phone={phone} onlineBookingEnabled={ready?.shop.onlineBookingEnabled}>
      <h1 className="hm-display text-3xl font-bold text-brass sm:text-4xl">{copy.manage.title}</h1>
      <div className="mt-6">
        {link ? (
          <Manager key={link.bookingId} api={api} locale={locale} copy={copy} link={link} catalog={ready} catalogStatus={catalog.status} reloadCatalog={catalog.reload} phone={phone} />
        ) : (
          <InvalidLink copy={copy} phone={phone} />
        )}
      </div>
    </CustomerShell>
  );
}

function InvalidLink({ copy, phone }: { copy: Copy; phone: string }) {
  return (
    <PageNotice>
      <Notice tone="warn" title={copy.manage.invalidTitle} actions={<><ButtonAnchor href={telHref(phone)}>{copy.common.callNumber(phone)}</ButtonAnchor><ButtonLink variant="ghost" to="/book">{copy.manage.bookAgain}</ButtonLink></>}>
        {copy.manage.invalidBody}
      </Notice>
    </PageNotice>
  );
}

interface ManagerProps {
  api: CustomerApi; locale: Locale; copy: Copy; link: ManageLink; phone: string;
  catalog: Catalog | null; catalogStatus: 'loading' | 'ready' | 'error'; reloadCatalog: () => void;
}

function Manager({ api, locale, copy, link, catalog, catalogStatus, reloadCatalog, phone }: ManagerProps) {
  const [view, setView] = useState<View>({ phase: 'loading' });
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [actionError, setActionError] = useState<{ code: ApiErrorCode; action: 'reschedule' | 'cancel' } | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // reschedule inputs
  const [keepBarber, setKeepBarber] = useState(true);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  // cancel inputs
  const [reason, setReason] = useState('');

  const load = useCallback(async (quiet = false): Promise<BookingView | null> => {
    try {
      const booking = await api.getBooking({ bookingId: link.bookingId, token: link.token });
      setView({ phase: 'ready', booking });
      return booking;
    } catch (error) {
      const code = readErrorCode(error) ?? 'INTERNAL_ERROR';
      // On a quiet refresh a transient failure must not hide the appointment we already show.
      if (code === 'INVALID_LINK') setView({ phase: 'invalid' });
      else if (!quiet) setView({ phase: 'error', code });
      return null;
    }
  }, [api, link.bookingId, link.token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (actionError || outcome) noticeRef.current?.focus(); }, [actionError, outcome]);
  useEffect(() => { if (panel !== 'none') panelRef.current?.focus(); }, [panel]);

  if (view.phase === 'loading') return <Spinner label={copy.manage.loading} />;
  if (view.phase === 'invalid') return <InvalidLink copy={copy} phone={phone} />;
  if (view.phase === 'error') {
    return (
      <PageNotice>
        <ErrorNotice copy={copy} code={view.code} extra={<p className="mt-1 font-medium">{copy.manage.loadErrorTitle}</p>} actions={<><Button onClick={() => { setView({ phase: 'loading' }); void load(); }}>{copy.common.retry}</Button><ButtonAnchor variant="ghost" href={telHref(phone)}>{copy.common.callNumber(phone)}</ButtonAnchor></>} />
      </PageNotice>
    );
  }

  const { booking } = view;
  const changeable = booking.canChange && booking.status === 'confirmed';
  const fixtures = catalog?.mode === 'fixtures';

  function closePanel() { setPanel('none'); setActionError(null); setSlot(null); }

  /** Reload the authoritative appointment after a conflict. The original stays visible while this runs. */
  async function refreshAfterConflict(code: ApiErrorCode) {
    const fresh = await load(true);
    if (!fresh) return; // reload failed: keep the error notice and the appointment already on screen
    setOutcome(fresh.status === 'cancelled' ? { kind: 'cancelled' } : { kind: 'refreshed' });
    if (!(fresh.canChange && fresh.status === 'confirmed')) setPanel('none');
    if (code === 'CHANGE_WINDOW_CLOSED' || code === 'BOOKING_NOT_CHANGEABLE') setSlot(null);
  }

  async function reschedule() {
    if (lock.current || !slot) return;
    lock.current = true;
    setBusy(true);
    setActionError(null);
    setOutcome(null);
    try {
      const updated = await api.rescheduleBooking({
        bookingId: link.bookingId, token: link.token, startsAt: slot.startsAt,
        barberId: keepBarber ? booking.barber.id : null, expectedRevision: booking.revision,
      });
      setOutcome({ kind: 'rescheduled', previousStartsAt: booking.startsAt });
      setView({ phase: 'ready', booking: updated });
      setPanel('none');
      setSlot(null);
    } catch (error) {
      const code = readErrorCode(error) ?? 'INTERNAL_ERROR';
      // The original appointment is untouched: `view` only changes on success or after an authoritative reload.
      setActionError({ code, action: 'reschedule' });
      if (code === 'SLOT_UNAVAILABLE') { setSlot(null); setRefreshToken((n) => n + 1); }
      else if (code === 'INVALID_LINK') setView({ phase: 'invalid' });
      else if (code === 'STALE_BOOKING' || code === 'BOOKING_NOT_CHANGEABLE' || code === 'CHANGE_WINDOW_CLOSED') await refreshAfterConflict(code);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setActionError(null);
    setOutcome(null);
    try {
      const updated = await api.cancelBooking({
        bookingId: link.bookingId, token: link.token, expectedRevision: booking.revision,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setOutcome({ kind: 'cancelled' });
      setView({ phase: 'ready', booking: updated });
      setPanel('none');
      setReason('');
    } catch (error) {
      const code = readErrorCode(error) ?? 'INTERNAL_ERROR';
      setActionError({ code, action: 'cancel' });
      if (code === 'INVALID_LINK') setView({ phase: 'invalid' });
      else if (code === 'STALE_BOOKING' || code === 'BOOKING_NOT_CHANGEABLE' || code === 'CHANGE_WINDOW_CLOSED') await refreshAfterConflict(code);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {fixtures ? <Notice tone="warn" title={copy.confirmation.fixturesStamp}>{copy.fixtures.bookingNote}</Notice> : null}

      {outcome?.kind === 'rescheduled' ? (
        <Notice ref={noticeRef} tone="success" title={copy.manage.rescheduleDone}>
          <p>{copy.manage.rescheduleDoneBody}</p>
          <p className="text-muted">{copy.manage.previousTime(formatDateTime(outcome.previousStartsAt, locale))}</p>
        </Notice>
      ) : null}
      {outcome?.kind === 'cancelled' ? (
        <Notice ref={noticeRef} tone="success" title={copy.manage.cancelDone} actions={<ButtonLink to="/book">{copy.manage.bookAgain}</ButtonLink>}>{copy.manage.cancelDoneBody}</Notice>
      ) : null}
      {outcome?.kind === 'refreshed' ? <Notice ref={noticeRef} tone="info" title={copy.manage.refreshed} /> : null}

      <AppointmentCard booking={booking} locale={locale} copy={copy} kept={actionError !== null} />

      {actionError ? (
        <ErrorNotice
          noticeRef={noticeRef} copy={copy} code={actionError.code}
          extra={<p className="mt-1 font-medium">{actionError.action === 'reschedule' ? copy.manage.rescheduleFailed : copy.manage.cancelFailed}</p>}
          actions={actionError.code === 'CHANGE_WINDOW_CLOSED' || actionError.code === 'INTERNAL_ERROR' || actionError.code === 'NETWORK_ERROR' ? <ButtonAnchor variant="ghost" href={telHref(phone)}>{copy.common.callNumber(phone)}</ButtonAnchor> : null}
        />
      ) : null}

      {booking.status === 'cancelled' ? null : changeable ? (
        <>
          <p className="text-sm text-muted">{copy.manage.deadline(formatDateTime(booking.cancellationDeadline, locale))}</p>
          {panel === 'none' ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => { setActionError(null); setOutcome(null); setPanel('reschedule'); }}>{copy.manage.reschedule}</Button>
              <Button variant="danger" onClick={() => { setActionError(null); setOutcome(null); setPanel('cancel'); }}>{copy.manage.cancel}</Button>
              {!fixtures ? <Button variant="ghost" onClick={() => downloadCalendarFile(booking)}>{copy.manage.calendar}</Button> : null}
            </div>
          ) : null}
        </>
      ) : (
        <Notice
          tone="warn" title={copy.manage.cannotChangeTitle}
          actions={<ButtonAnchor href={telHref(phone)}>{copy.common.callNumber(phone)}</ButtonAnchor>}
        >
          <p>{copy.manage.cannotChangeBody(phone)}</p>
          <p className="mt-1">{copy.manage.deadline(formatDateTime(booking.cancellationDeadline, locale))}</p>
        </Notice>
      )}

      {panel === 'reschedule' && changeable ? (
        <section ref={panelRef} tabIndex={-1} aria-labelledby="resched-h" className="space-y-5 rounded-lg border border-ink/20 bg-panel p-5 outline-none">
          <div>
            <h2 id="resched-h" className="hm-display text-xl font-bold text-brass">{copy.manage.rescheduleTitle}</h2>
            <p className="text-sm text-muted">{copy.manage.rescheduleLead}</p>
          </div>

          <fieldset>
            <legend className="mb-2 font-medium">{copy.manage.barberGroup}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${choiceCard} items-center gap-3 p-4`}>
                <input type="radio" name="resched-barber" className="h-5 w-5 accent-[#d0af6b]" checked={keepBarber} onChange={() => { setKeepBarber(true); setSlot(null); }} />
                <span className="font-bold">{copy.manage.keepSameBarber(booking.barber.name[locale])}</span>
              </label>
              <label className={`${choiceCard} items-center gap-3 p-4`}>
                <input type="radio" name="resched-barber" className="h-5 w-5 accent-[#d0af6b]" checked={!keepBarber} onChange={() => { setKeepBarber(false); setSlot(null); }} />
                <span className="font-bold">{copy.manage.anyBarber}</span>
              </label>
            </div>
          </fieldset>

          <ReschedulePicker
            api={api} locale={locale} catalog={catalog} catalogStatus={catalogStatus} reloadCatalog={reloadCatalog} copy={copy}
            serviceIds={booking.services.map((s) => s.id)} barberId={keepBarber ? booking.barber.id : null}
            date={date} setDate={setDate} slot={slot} setSlot={setSlot} refreshToken={refreshToken} onRefresh={() => setRefreshToken((n) => n + 1)}
          />

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void reschedule()} disabled={!slot || busy}>{busy ? copy.manage.rescheduling : copy.manage.confirmReschedule}</Button>
            <Button variant="ghost" onClick={closePanel} disabled={busy}>{copy.manage.abort}</Button>
          </div>
        </section>
      ) : null}

      {panel === 'cancel' && changeable ? (
        <section ref={panelRef} tabIndex={-1} aria-labelledby="cancel-h" className="space-y-4 rounded-lg border border-[#c0392b]/60 bg-panel p-5 outline-none">
          <div>
            <h2 id="cancel-h" className="hm-display text-xl font-bold text-[#a3261a]">{copy.manage.cancelTitle}</h2>
            <p className="text-sm text-muted">{copy.manage.cancelBody}</p>
          </div>
          <Field label={copy.manage.cancelReason}>
            {({ id, describedBy, invalid }) => (
              <textarea id={id} rows={2} maxLength={300} className={`${inputClass} min-h-20`} value={reason} aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" onClick={() => void cancel()} disabled={busy}>{busy ? copy.manage.cancelling : copy.manage.cancelConfirm}</Button>
            <Button variant="ghost" onClick={closePanel} disabled={busy}>{copy.manage.abort}</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AppointmentCard({ booking, locale, copy, kept }: { booking: BookingView; locale: Locale; copy: Copy; kept: boolean }) {
  const cancelled = booking.status === 'cancelled';
  return (
    <section aria-labelledby="current-h" className={`rounded-lg border bg-panel p-5 ${cancelled ? 'border-ink/15 opacity-80' : 'border-brass/60'}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="current-h" className="hm-display text-xl font-bold text-brass">{copy.manage.current}</h2>
        <span className="rounded-full border border-ink/30 px-3 py-1 text-sm font-bold">{copy.manage.status[booking.status]}</span>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">{copy.manage.reference}</dt><dd className="font-bold tracking-wide">{booking.reference}</dd></div>
        <div><dt className="text-muted">{copy.manage.when}</dt><dd className={`font-medium ${cancelled ? 'line-through' : ''}`}>{formatDateTime(booking.startsAt, locale)}</dd></div>
        <div><dt className="text-muted">{copy.manage.barber}</dt><dd className="font-medium">{booking.barber.name[locale]}</dd></div>
        <div><dt className="text-muted">{copy.manage.total}</dt><dd className="font-medium">{formatBaht(booking.totalBaht, locale)}</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-muted">{copy.manage.services}</dt>
          <dd><ul className="font-medium">{booking.services.map((s) => <li key={s.id}>{s.name[locale]} · {copy.common.minutes(s.durationMinutes)} · {formatBaht(s.priceBaht, locale)}</li>)}</ul></dd>
        </div>
      </dl>
      {kept ? <p className="mt-4 text-sm font-medium text-brass">{copy.manage.currentKept}</p> : null}
    </section>
  );
}

interface PickerProps {
  api: CustomerApi; locale: Locale; copy: Copy; catalog: Catalog | null; catalogStatus: 'loading' | 'ready' | 'error'; reloadCatalog: () => void;
  serviceIds: string[]; barberId: string | null; date: string | null; setDate: (d: string) => void; slot: Slot | null; setSlot: (s: Slot | null) => void;
  refreshToken: number; onRefresh: () => void;
}

function ReschedulePicker({ api, locale, copy, catalog, catalogStatus, reloadCatalog, serviceIds, barberId, date, setDate, slot, setSlot, refreshToken, onRefresh }: PickerProps) {
  if (catalogStatus === 'loading') return <Spinner label={copy.common.loading} />;
  if (!catalog) return <ErrorNotice copy={copy} code="NETWORK_ERROR" actions={<Button variant="ghost" onClick={reloadCatalog}>{copy.common.retry}</Button>} />;
  const effective = date ?? firstOpenDate(buildDateOptions(catalog.shop));
  if (!effective) return <Notice title={copy.booking.slotsEmptyTitle}>{copy.booking.slotsEmptyBody}</Notice>;
  return (
    <SlotPicker
      api={api} locale={locale} shop={catalog.shop} barbers={catalog.barbers} serviceIds={serviceIds} durationMinutes={sumKnown(catalog.services.filter((x) => serviceIds.includes(x.id)).map((x) => x.durationMinutes))} barberId={barberId}
      date={effective} onDateChange={setDate} selected={slot?.startsAt ?? null} onSelect={setSlot}
      refreshToken={refreshToken} onRefresh={onRefresh} idPrefix="resched"
    />
  );
}
