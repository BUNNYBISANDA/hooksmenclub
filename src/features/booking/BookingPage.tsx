import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ApiErrorCode, Barber, Catalog, LocalizedText, Slot } from '../../types/api';
import { SHOP_FACTS, formatBaht, formatDateTime, getCopy, readErrorCode, telHref } from '../../locales';
import { CustomerShell, PageNotice } from '../../components/customer/CustomerShell';
import type { CustomerPageProps } from '../../components/customer/types';
import { useCatalog } from '../../components/customer/hooks';
import { buildDateOptions, firstOpenDate } from '../../components/customer/dates';
import { SlotPicker } from '../../components/customer/SlotPicker';
import { TurnstileWidget } from '../../components/customer/TurnstileWidget';
import { durationText, priceText, sumKnown } from '../../components/customer/display';
import { Button, ButtonAnchor, ButtonLink, ErrorNotice, Field, Notice, PlaceholderTag, SkeletonCards, inputClass } from '../../components/customer/ui';
import { NAME_MAX, NOTE_MAX, createCredentialSession, eligibleBarbers, reconcileBarber, submissionSignature, toggleService, validateBooking, type CustomerForm, type FormErrors } from './selection';

const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
/** Only used when the catalog reports mode 'fixtures'. Live mode never skips verification. */
const FIXTURES_CAPTCHA_PLACEHOLDER = 'fixtures-turnstile-skipped';

const emptyForm: CustomerForm = { name: '', phone: '', note: '', marketingOptIn: false };

export function BookingPage({ api, locale, onLocaleChange }: CustomerPageProps) {
  const copy = getCopy(locale);
  const catalog = useCatalog(api);
  const ready = catalog.status === 'ready' ? catalog.data : null;
  return (
    <CustomerShell locale={locale} onLocaleChange={onLocaleChange} title={copy.booking.title} mode={ready?.mode} phone={ready?.shop.phone} onlineBookingEnabled={ready?.shop.onlineBookingEnabled} bare>
      <section className="hm-hero-wash border-b border-ink/10">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:pt-14">
          <p className="hm-eyebrow hm-rise">{copy.home.eyebrow}</p>
          <h1 className="hm-display hm-rise hm-rise-2 mt-4 text-5xl text-ink sm:text-6xl">{copy.booking.title}</h1>
          <p className="hm-rise hm-rise-3 mt-3 max-w-xl text-lg text-muted">{copy.booking.lead}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:pb-16">
        {catalog.status === 'loading' ? <SkeletonCards count={2} label={copy.booking.loadingCatalog} /> : null}
        {catalog.status === 'error' ? (
          <PageNotice>
            <ErrorNotice copy={copy} code={catalog.code} extra={<p className="mt-1 font-medium">{copy.booking.catalogErrorTitle}</p>} actions={<><Button variant="ghost" onClick={catalog.reload}>{copy.common.retry}</Button><ButtonAnchor href={telHref(SHOP_FACTS.phone)}>{copy.common.callShop}</ButtonAnchor></>} />
          </PageNotice>
        ) : null}
        {ready ? <BookingFlow api={api} locale={locale} catalog={ready} reloadCatalog={catalog.reload} /> : null}
      </div>
    </CustomerShell>
  );
}

/** First letter of the last word of the English name ("Barber A" → "A"). Shown when no real photo exists. */
function initialOf(name: LocalizedText): string {
  const words = name.en.trim().split(/\s+/);
  return (words[words.length - 1] ?? '?').charAt(0).toUpperCase();
}

function Check() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8.5 3.2 3L13 4.5" /></svg>;
}

function Stepper({ labels, title, doneLabel, done }: { labels: readonly string[]; title: string; doneLabel: string; done: boolean[] }) {
  const current = done.findIndex((d) => !d);
  const ids = ['service', 'barber', 'slot', 'details'];
  return (
    <nav aria-label={title} className="mb-8">
      <ol className="grid grid-cols-4 gap-2">
        {labels.map((label, i) => {
          const isDone = done[i];
          const isCurrent = i === (current === -1 ? labels.length - 1 : current);
          return (
            <li key={label} className="relative">
              <a href={`#step-${ids[i]}`} className="flex flex-col items-center gap-1.5 text-center focus-visible:outline-3 focus-visible:outline-brass">
                <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold transition-colors ${isDone ? 'border-ink bg-ink text-paper' : isCurrent ? 'border-brass bg-panel text-brass ring-4 ring-gold/25' : 'border-ink/25 bg-panel text-muted'}`}>
                  {isDone ? <Check /> : i + 1}
                </span>
                <span className={`text-xs font-bold sm:text-sm ${isDone || isCurrent ? 'text-ink' : 'text-muted'}`}>{label}{isDone ? <span className="hm-sr-only"> ({doneLabel})</span> : null}</span>
              </a>
              {i < labels.length - 1 ? <span aria-hidden="true" className={`absolute left-[calc(50%+1.5rem)] right-[calc(-50%+1.5rem)] top-[1.1rem] h-px ${isDone ? 'bg-ink' : 'bg-ink/20'}`} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepCard({ n, id, title, hint, done, section, describedBy, children }: { n: number; id: string; title: string; hint?: string; done: boolean; section?: string; describedBy?: string; children: ReactNode }) {
  return (
    <section id={`step-${id}`} data-section={section} tabIndex={section ? -1 : undefined} aria-labelledby={`${id}-h`} aria-describedby={describedBy} className="scroll-mt-28 border border-ink/10 bg-panel p-5 outline-none sm:p-7">
      <header className="mb-5 flex items-start gap-4">
        <span aria-hidden="true" className={`hm-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xl ${done ? 'border-ink bg-ink text-paper' : 'border-gold text-brass'}`}>{done ? <Check /> : n}</span>
        <div>
          <h2 id={`${id}-h`} className="hm-display text-3xl text-ink">{title}</h2>
          {hint ? <p className="text-sm text-muted">{hint}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function BookingFlow({ api, locale, catalog, reloadCatalog }: { api: CustomerPageProps['api']; locale: CustomerPageProps['locale']; catalog: Catalog; reloadCatalog: () => void }) {
  const copy = getCopy(locale);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { shop } = catalog;
  const bookable = useMemo(() => catalog.services.filter((s) => s.bookable), [catalog.services]);

  const [serviceIds, setServiceIds] = useState<string[]>(() => {
    const wanted = params.get('service');
    return wanted && catalog.services.some((s) => s.id === wanted && s.bookable) ? [wanted] : [];
  });
  const [barberId, setBarberId] = useState<string | null>(null);
  const [barberReset, setBarberReset] = useState(false);
  const dateOptions = useMemo(() => buildDateOptions(shop), [shop]);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const date = pickedDate ?? firstOpenDate(dateOptions);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slotLost, setSlotLost] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<ApiErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  const lock = useRef(false);
  const credentials = useRef(createCredentialSession());
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const fixtures = catalog.mode === 'fixtures';
  const useWidget = Boolean(TURNSTILE_SITE_KEY);
  const captchaConfigured = useWidget || fixtures;

  const eligible = eligibleBarbers(catalog.barbers, serviceIds);
  const selectedServices = catalog.services.filter((s) => serviceIds.includes(s.id));
  const selectedBarber = catalog.barbers.find((b) => b.id === barberId) ?? null;

  useEffect(() => { if (submitError) errorRef.current?.focus(); }, [submitError]);

  function changeServices(next: string[]) {
    setServiceIds(next);
    setSlot(null);
    setSlotLost(false);
    setErrors((e) => ({ ...e, service: undefined, slot: undefined }));
    const kept = reconcileBarber(barberId, catalog.barbers, next);
    setBarberReset(Boolean(barberId) && kept === null);
    setBarberId(kept);
  }

  function changeBarber(id: string | null) {
    setBarberId(id);
    setBarberReset(false);
    setSlot(null);
    setSlotLost(false);
  }

  function setField<K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function focusFirstError(next: FormErrors) {
    const order = ['service', 'slot', 'name', 'phone', 'note', 'captcha'] as const;
    const first = order.find((k) => next[k]);
    if (!first) return;
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>(first === 'name' || first === 'phone' || first === 'note' ? `[data-field="${first}"]` : `[data-section="${first}"]`);
      target?.focus();
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return; // duplicate-submit guard: Enter key, double tap, slow network
    setSubmitError(null);

    const token = useWidget ? captchaToken : fixtures ? FIXTURES_CAPTCHA_PLACEHOLDER : null;
    const { errors: found, phone } = validateBooking({ serviceIds, slotStartsAt: slot?.startsAt ?? null, form, captchaOk: Boolean(token) });
    setErrors(found);
    if (Object.keys(found).length || !slot || !phone || !token) { focusFirstError(found); return; }

    lock.current = true;
    setSubmitting(true);
    let navigated = false;
    try {
      const creds = credentials.current.resolve(submissionSignature({
        serviceIds, barberId, startsAt: slot.startsAt, name: form.name, phone, note: form.note, marketingOptIn: form.marketingOptIn, locale,
      }));
      const result = await api.createBooking({
        serviceIds, barberId, startsAt: slot.startsAt,
        customer: { name: form.name.trim(), phone, locale, marketingOptIn: form.marketingOptIn },
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
        turnstileToken: token, idempotencyKey: creds.idempotencyKey, manageToken: creds.manageToken,
      });
      navigated = true;
      // replace: Back must not return to a filled form that could be submitted twice.
      navigate('/confirmation', { replace: true, state: { booking: result.booking, manageToken: creds.manageToken, mode: result.mode } });
    } catch (error) {
      const code = readErrorCode(error) ?? 'INTERNAL_ERROR';
      setSubmitError(code);
      if (code === 'SLOT_UNAVAILABLE') { setSlot(null); setSlotLost(false); setRefreshToken((n) => n + 1); }
      if (code === 'IDEMPOTENCY_CONFLICT') credentials.current.rotate();
      if (code === 'BOOKING_CLOSED' || code === 'NOT_CONFIGURED') reloadCatalog();
    } finally {
      lock.current = false;
      if (!navigated) {
        setSubmitting(false);
        // Turnstile tokens are single-use: always request a new one after an attempt.
        setCaptchaToken(null);
        setCaptchaReset((n) => n + 1);
      }
    }
  }

  if (!shop.onlineBookingEnabled) {
    return (
      <PageNotice>
        <Notice tone="warn" title={copy.booking.closedTitle} actions={<ButtonAnchor href={telHref(shop.phone)}>{copy.common.callNumber(shop.phone)}</ButtonAnchor>}>{copy.booking.closedBody}</Notice>
      </PageNotice>
    );
  }
  if (bookable.length === 0) {
    return (
      <PageNotice>
        <Notice title={copy.booking.noServicesTitle} actions={<ButtonAnchor href={telHref(shop.phone)}>{copy.common.callNumber(shop.phone)}</ButtonAnchor>}>{copy.booking.noServicesBody}</Notice>
      </PageNotice>
    );
  }
  if (!captchaConfigured) {
    return (
      <PageNotice>
        <Notice tone="warn" title={copy.errors.NOT_CONFIGURED.title} actions={<ButtonAnchor href={telHref(shop.phone)}>{copy.common.callNumber(shop.phone)}</ButtonAnchor>}>{copy.booking.captchaMissing}</Notice>
      </PageNotice>
    );
  }

  const price = sumKnown(selectedServices.map((s) => s.priceBaht));
  const minutes = sumKnown(selectedServices.map((s) => s.durationMinutes));
  const hasPlaceholder = selectedServices.some((s) => s.isPlaceholder);
  const errorText = (key: keyof FormErrors) => (errors[key] ? copy.booking[errors[key]!] : null);

  const nameOk = form.name.trim().length > 0;
  const phoneOk = form.phone.replace(/\D/g, '').length >= 9;
  const done = [serviceIds.length > 0, serviceIds.length > 0 && eligible.length > 0, Boolean(slot), nameOk && phoneOk];
  const clock = copy.common.clockSuffix ? ` ${copy.common.clockSuffix}` : '';
  const tbc = copy.booking.summaryTbc;

  return (
    <>
    <Stepper labels={copy.booking.steps} title={copy.booking.stepsLabel} doneLabel={copy.booking.stepDone} done={done} />
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={submitting} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0 space-y-6">
        {fixtures ? <Notice tone="warn" title={copy.fixtures.banner}>{copy.fixtures.bookingNote}</Notice> : null}

        <StepCard n={1} id="service" section="service" title={copy.booking.stepService} hint={copy.booking.stepServiceHint} done={done[0]} describedBy={errors.service ? 'service-error' : undefined}>
          <div className="grid gap-3 sm:grid-cols-2">
            {catalog.services.map((s) => (
              <label key={s.id} className="hm-card flex cursor-pointer items-start gap-3 border border-ink/15 bg-panel p-4 has-[:checked]:border-ink has-[:checked]:bg-sand has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-ink)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brass has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                <input type="checkbox" className="peer hm-sr-only" checked={serviceIds.includes(s.id)} disabled={!s.bookable} onChange={() => changeServices(toggleService(serviceIds, s.id))} />
                <span aria-hidden="true" className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-ink/40 bg-panel text-paper peer-checked:border-ink peer-checked:bg-ink [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"><Check /></span>
                <span className="block min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="hm-display text-xl text-ink">{s.name[locale]}</span>
                    <span className="shrink-0 font-bold text-brass">{priceText(s, copy, locale)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{s.description[locale]}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded-full bg-ink/[0.06] px-2 py-0.5">{durationText(s, copy)}</span>
                    {s.isPlaceholder ? <PlaceholderTag copy={copy} /> : null}
                  </span>
                  {!s.bookable ? <span className="mt-1 block text-sm text-brass">{copy.booking.serviceNotBookable}</span> : null}
                </span>
              </label>
            ))}
          </div>
          {selectedServices.length ? (
            <p role="status" className="mt-4 bg-sand px-4 py-2.5 text-sm font-bold text-ink">
              {copy.booking.servicesPicked(selectedServices.length, minutes === null ? tbc : copy.common.minutes(minutes), price === null ? tbc : formatBaht(price, locale))}
            </p>
          ) : null}
          {errors.service ? <p id="service-error" role="alert" className="mt-2 text-sm font-medium text-[#a3261a]">{errorText('service')}</p> : null}
        </StepCard>

        <StepCard n={2} id="barber" title={copy.booking.stepBarber} hint={serviceIds.length ? copy.booking.chooseBarberHint : copy.booking.pickServiceFirst} done={done[1]}>
          <div role="radiogroup" aria-label={copy.booking.stepBarber} className="grid gap-3 sm:grid-cols-2">
            {[null, ...eligible].map((b: Barber | null) => (
              <label key={b?.id ?? 'any'} className="hm-card flex cursor-pointer items-center gap-4 border border-ink/15 bg-panel p-4 has-[:checked]:border-ink has-[:checked]:bg-sand has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-ink)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brass">
                <input type="radio" name="barber" className="hm-sr-only" checked={barberId === (b?.id ?? null)} onChange={() => changeBarber(b?.id ?? null)} />
                {b === null ? (
                  <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-dashed border-gold text-brass">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.3" /><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5M15 14.4c2.6-.4 4.7 1 5.5 4" /></svg>
                  </span>
                ) : b.photoUrl && !b.isPlaceholder ? (
                  <img src={b.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="hm-display flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-2xl text-gold">{initialOf(b.name)}</span>
                )}
                <span className="block min-w-0">
                  <span className="hm-display block text-xl text-ink">{b ? b.name[locale] : copy.booking.anyBarber}</span>
                  <span className="block text-sm text-muted">{b ? b.specialties[locale] : copy.booking.anyBarberHint}</span>
                  {b?.isPlaceholder ? <span className="mt-1 inline-block"><PlaceholderTag copy={copy} /></span> : null}
                </span>
              </label>
            ))}
          </div>
          {serviceIds.length > 0 && eligible.length === 0 && catalog.barbers.length > 0 ? <p role="status" className="mt-3 text-sm text-brass">{copy.booking.barberNoMatch}</p> : null}
          {barberReset ? <p role="status" className="mt-3 text-sm text-brass">{copy.booking.barberReset}</p> : null}
        </StepCard>

        <StepCard n={3} id="slot" section="slot" title={copy.booking.stepDateTime} hint={selectedBarber ? selectedBarber.name[locale] : copy.booking.anyBarber} done={done[2]}>
          {date ? (
            <SlotPicker
              api={api} locale={locale} shop={shop} barbers={catalog.barbers} serviceIds={serviceIds} durationMinutes={minutes} barberId={barberId}
              date={date} onDateChange={(d) => { setPickedDate(d); setSlotLost(false); }}
              selected={slot?.startsAt ?? null} onSelect={(s) => { setSlot(s); if (s) { setSlotLost(false); setErrors((e) => ({ ...e, slot: undefined })); } }}
              onSelectionLost={() => setSlotLost(true)}
              refreshToken={refreshToken} onRefresh={() => setRefreshToken((n) => n + 1)} idPrefix="book"
            />
          ) : (
            <Notice title={copy.booking.slotsEmptyTitle}>{copy.booking.slotsEmptyBody}</Notice>
          )}
          {slotLost ? <p role="alert" className="mt-3 text-sm font-medium text-brass">{copy.booking.slotChanged}</p> : null}
          {errors.slot ? <p role="alert" className="mt-3 text-sm font-medium text-[#a3261a]">{errorText('slot')}</p> : null}
        </StepCard>

        <StepCard n={4} id="details" title={copy.booking.stepDetails} done={done[3]}>
          <div className="space-y-4">
            <Field label={copy.booking.name} error={errorText('name')}>
              {({ id, describedBy, invalid }) => (
                <input id={id} data-field="name" className={inputClass} type="text" autoComplete="name" required maxLength={NAME_MAX + 20} placeholder={copy.booking.namePlaceholder} value={form.name} aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => setField('name', e.target.value)} />
              )}
            </Field>
            <Field label={copy.booking.phone} hint={copy.booking.phoneHelp} error={errorText('phone')}>
              {({ id, describedBy, invalid }) => (
                <input id={id} data-field="phone" className={inputClass} type="tel" inputMode="tel" autoComplete="tel" required placeholder="081 234 5678" value={form.phone} aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => setField('phone', e.target.value)} />
              )}
            </Field>
            <Field label={copy.booking.note} optionalText={copy.common.optional} hint={copy.booking.noteHelp} error={errorText('note')}>
              {({ id, describedBy, invalid }) => (
                <textarea id={id} data-field="note" className={`${inputClass} min-h-24`} rows={3} maxLength={NOTE_MAX + 50} value={form.note} aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => setField('note', e.target.value)} />
              )}
            </Field>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
              <input type="checkbox" className="mt-1.5 h-5 w-5 accent-[#84632c]" checked={form.marketingOptIn} onChange={(e) => setField('marketingOptIn', e.target.checked)} />
              <span>{copy.booking.marketing}</span>
            </label>
          </div>
        </StepCard>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-labelledby="summary-h">
        <div className="border border-ink/15 border-t-4 border-t-gold bg-panel p-6 shadow-[0_20px_40px_-28px_rgba(28,25,21,0.5)]">
          <h2 id="summary-h" className="hm-display mb-4 text-3xl text-ink">{copy.booking.summaryTitle}</h2>
          {selectedServices.length === 0 && !slot ? (
            <p className="text-muted">{copy.booking.summaryEmpty}</p>
          ) : (
            <dl className="divide-y divide-ink/10 text-sm">
              <div className="py-3 first:pt-0"><dt className="text-muted">{copy.booking.summaryServices}</dt><dd className="mt-0.5 font-bold">{selectedServices.map((s) => s.name[locale]).join(' + ') || '—'}{hasPlaceholder ? <> <PlaceholderTag copy={copy} /></> : null}</dd></div>
              <div className="py-3"><dt className="text-muted">{copy.booking.summaryBarber}</dt><dd className="mt-0.5 font-bold">{selectedBarber ? selectedBarber.name[locale] : copy.booking.anyBarber}</dd></div>
              <div className="py-3"><dt className="text-muted">{copy.booking.summaryWhen}</dt><dd className="mt-0.5 font-bold">{slot ? formatDateTime(slot.startsAt, locale) + clock : '—'}</dd></div>
              <div className="py-3"><dt className="text-muted">{copy.booking.summaryDuration}</dt><dd className="mt-0.5 font-bold">{selectedServices.length ? (minutes === null ? tbc : copy.common.minutes(minutes)) : '—'}</dd></div>
              <div className="flex items-baseline justify-between pt-4"><dt className="text-muted">{copy.booking.summaryPrice}</dt><dd className="hm-display text-3xl text-brass">{selectedServices.length ? (price === null ? tbc : formatBaht(price, locale)) : '—'}</dd></div>
            </dl>
          )}
          <p className="mt-4 text-xs text-muted">{copy.booking.summaryPriceNote}</p>
        </div>

        {useWidget ? (
          <div>
            <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} locale={locale} copy={copy} resetSignal={captchaReset} onToken={(t) => { setCaptchaToken(t); if (t) setErrors((e) => ({ ...e, captcha: undefined })); }} />
            {errors.captcha ? <p data-section="captcha" tabIndex={-1} role="alert" className="mt-2 text-sm font-medium text-[#a3261a] outline-none">{errorText('captcha')}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">{copy.booking.captchaFixturesSkipped}</p>
        )}

        {submitError ? (
          <ErrorNotice
            noticeRef={errorRef} copy={copy} code={submitError}
            extra={submitError === 'NETWORK_ERROR' || submitError === 'INTERNAL_ERROR' ? <p className="mt-1">{copy.booking.retrySafe}</p> : null}
            actions={submitError === 'BOOKING_CLOSED' || submitError === 'NOT_CONFIGURED' ? <ButtonAnchor href={telHref(shop.phone)}>{copy.common.callNumber(shop.phone)}</ButtonAnchor> : null}
          />
        ) : null}

        <Button type="submit" className="w-full !min-h-14 text-base" disabled={submitting}>
          {submitting ? copy.booking.submitting : copy.booking.submit}
        </Button>
        <p className="text-center text-xs text-muted"><Link className="underline" to={{ pathname: '/', hash: '#policies' }}>{copy.booking.privacyLink}</Link></p>
        <ButtonLink to="/" variant="ghost" className="w-full">{copy.common.home}</ButtonLink>
      </aside>
    </form>
    </>
  );
}
