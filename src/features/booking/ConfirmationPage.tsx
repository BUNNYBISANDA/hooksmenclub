import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { BookingView, Locale } from '../../types/api';
import { SHOP_FACTS, formatBaht, formatDateTime, getCopy, telHref, type Copy } from '../../locales';
import { makeManageUrl } from '../../lib/booking';
import { downloadCalendarFile } from '../../components/customer/calendar';
import { CustomerShell, PageNotice } from '../../components/customer/CustomerShell';
import type { CustomerPageProps } from '../../components/customer/types';
import { Button, ButtonAnchor, ButtonLink, Notice } from '../../components/customer/ui';
import { isConfirmationState } from './selection';

export function ConfirmationPage({ locale, onLocaleChange }: CustomerPageProps) {
  const copy = getCopy(locale);
  const location = useLocation();
  // Captured once from in-memory router state. Never written to storage, logs or analytics.
  const captured = useRef(isConfirmationState(location.state) ? location.state : null);
  const state = captured.current;

  return (
    <CustomerShell locale={locale} onLocaleChange={onLocaleChange} title={state?.mode === 'fixtures' ? copy.confirmation.fixturesTitle : state ? copy.confirmation.title : copy.confirmation.recoveryTitle} mode={state?.mode}>
      {state ? (
        <Confirmed booking={state.booking} manageToken={state.manageToken} mode={state.mode} locale={locale} copy={copy} />
      ) : (
        <PageNotice>
          <Notice tone="warn" title={copy.confirmation.recoveryTitle} actions={<><ButtonLink to="/book">{copy.confirmation.recoveryBook}</ButtonLink><ButtonAnchor variant="ghost" href={telHref(SHOP_FACTS.phone)}>{copy.common.callNumber(SHOP_FACTS.phone)}</ButtonAnchor><ButtonLink variant="ghost" to="/">{copy.common.home}</ButtonLink></>}>
            {copy.confirmation.recoveryBody}
          </Notice>
        </PageNotice>
      )}
    </CustomerShell>
  );
}

function Confirmed({ booking, manageToken, mode, locale, copy }: { booking: BookingView; manageToken: string; mode: 'live' | 'fixtures'; locale: Locale; copy: Copy }) {
  const fixtures = mode === 'fixtures';
  const manageUrl = makeManageUrl(booking.id, manageToken);
  const manageHash = new URL(manageUrl).hash;
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const fieldRef = useRef<HTMLInputElement>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(manageUrl);
      setCopied('ok');
    } catch {
      fieldRef.current?.select();
      setCopied('failed');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {fixtures ? (
        <Notice tone="warn" title={copy.confirmation.fixturesStamp}>
          <p className="font-bold">{copy.confirmation.fixturesTitle}</p>
          <p>{copy.confirmation.fixturesBody}</p>
        </Notice>
      ) : (
        <Notice tone="success" title={copy.confirmation.title} />
      )}

      <section aria-labelledby="summary-h" className="rounded-lg border border-ink/20 bg-panel p-5">
        <h1 id="summary-h" className="hm-display mb-4 text-2xl font-bold text-brass">{fixtures ? copy.confirmation.fixturesTitle : copy.confirmation.title}</h1>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">{copy.confirmation.reference}</dt><dd className="font-bold tracking-wide">{booking.reference}</dd></div>
          <div><dt className="text-muted">{copy.confirmation.customer}</dt><dd className="font-medium">{booking.customerName}</dd></div>
          <div><dt className="text-muted">{copy.confirmation.when}</dt><dd className="font-medium">{formatDateTime(booking.startsAt, locale)}</dd></div>
          <div><dt className="text-muted">{copy.confirmation.barber}</dt><dd className="font-medium">{booking.barber.name[locale]}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-muted">{copy.confirmation.services}</dt>
            <dd><ul className="font-medium">{booking.services.map((s) => <li key={s.id}>{s.name[locale]} · {copy.common.minutes(s.durationMinutes)} · {formatBaht(s.priceBaht, locale)}</li>)}</ul></dd>
          </div>
          <div><dt className="text-muted">{copy.confirmation.total}</dt><dd className="font-bold">{formatBaht(booking.totalBaht, locale)}</dd></div>
          <div><dt className="text-muted">{copy.confirmation.address}</dt><dd>{SHOP_FACTS.address}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-muted">{copy.confirmation.deadline(formatDateTime(booking.cancellationDeadline, locale))}</p>
      </section>

      <section aria-labelledby="manage-h" className="rounded-lg border border-brass/60 bg-brass/5 p-5">
        <h2 id="manage-h" className="hm-display mb-2 text-xl font-bold text-brass">{copy.confirmation.manageTitle}</h2>
        <p className="mb-3 text-sm">{copy.confirmation.manageBody}</p>
        <label htmlFor="manage-link" className="mb-1 block text-sm font-medium">{copy.confirmation.linkFieldLabel}</label>
        <input id="manage-link" ref={fieldRef} readOnly value={manageUrl} onFocus={(e) => e.currentTarget.select()} className="block min-h-11 w-full rounded-md border border-ink/30 bg-sand px-3 text-sm text-ink" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={copyLink}>{copied === 'ok' ? copy.confirmation.copied : copy.confirmation.copy}</Button>
          <ButtonLink variant="ghost" to={{ pathname: '/manage', hash: manageHash }}>{copy.confirmation.openManage}</ButtonLink>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm text-brass">{copied === 'ok' ? copy.confirmation.copied : copied === 'failed' ? copy.confirmation.copyFailed : ''}</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {fixtures ? (
          <p className="text-sm text-muted">{copy.confirmation.calendarFixtures}</p>
        ) : (
          <Button variant="ghost" onClick={() => downloadCalendarFile(booking)}>{copy.confirmation.calendar}</Button>
        )}
        <ButtonAnchor variant="ghost" href={telHref(SHOP_FACTS.phone)}>{copy.common.callNumber(SHOP_FACTS.phone)}</ButtonAnchor>
        <ButtonLink variant="ghost" to="/">{copy.common.home}</ButtonLink>
      </div>
    </div>
  );
}
