import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Locale } from '../../types/api';
import { SHOP_FACTS, getCopy, telHref } from '../../locales';
import './customer.css';

interface ShellProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  title: string;
  /** Catalog mode; 'fixtures' shows the persistent test-mode notice. */
  mode?: 'live' | 'fixtures';
  phone?: string;
  onlineBookingEnabled?: boolean;
  /** Mobile sticky Book/Call bar (home page). */
  stickyCta?: boolean;
  /** Home page: sections manage their own full-width bands and containers. */
  bare?: boolean;
  children: ReactNode;
}

const navLinks = ['services', 'barbers', 'gallery', 'visit', 'faq'] as const;

export function CustomerShell({ locale, onLocaleChange, title, mode, phone = SHOP_FACTS.phone, onlineBookingEnabled = true, stickyCta = false, bare = false, children }: ShellProps) {
  const copy = getCopy(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${title} · Hook Menclub`;
  }, [locale, title]);

  const next: Locale = locale === 'th' ? 'en' : 'th';
  return (
    <div className="hm-root" lang={locale}>
      <a href="#main" className="hm-skip">{copy.common.skipToContent}</a>
      {mode === 'fixtures' ? (
        <div role="status" className="bg-ink px-4 py-2 text-center text-sm font-bold text-gold">{copy.fixtures.banner}</div>
      ) : null}
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 px-4">
          <Link to="/" className="flex min-h-14 items-center gap-3" aria-label="Hook Menclub">
            <span aria-hidden="true" className="hm-display flex h-9 w-9 items-center justify-center rounded-full border border-gold text-lg text-brass">H</span>
            <span className="hm-display text-2xl font-bold tracking-wide text-ink">Hook Menclub</span>
          </Link>
          <nav aria-label={copy.common.primaryNav} className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 pb-1 md:order-none md:mx-0 md:ml-6 md:w-auto md:flex-1 md:overflow-visible md:px-0 md:pb-0">
            {navLinks.map((id) => (
              <Link key={id} to={{ pathname: '/', hash: `#${id}` }} className="flex min-h-11 shrink-0 items-center px-3 text-xs font-bold uppercase tracking-[0.14em] text-ink/80 hover:text-brass [&:lang(th)]:text-sm [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal">{copy.nav[id]}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              lang={next}
              aria-label={copy.common.toggleLabel}
              onClick={() => onLocaleChange(next)}
              className="min-h-11 min-w-11 rounded-sm border border-ink/25 px-3 text-sm font-bold text-ink hover:border-brass hover:text-brass"
            >{copy.common.toggleText}</button>
            <Link to="/book" className="inline-flex min-h-11 items-center rounded-sm bg-ink px-5 text-xs font-bold uppercase tracking-[0.12em] text-paper hover:bg-brass [&:lang(th)]:text-sm [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal">{copy.nav.book}</Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className={bare ? 'outline-none' : 'mx-auto max-w-5xl px-4 pb-24 pt-8 outline-none sm:pb-12'}>{children}</main>

      <footer className="border-t border-ink/10 bg-sand px-4 pb-28 pt-12 text-sm text-muted sm:pb-10">
        <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.4fr_1.2fr]">
          <div>
            <p className="hm-display text-2xl font-bold text-ink">Hook Menclub</p>
            <p className="mt-2 max-w-xs">{copy.home.eyebrow}</p>
            <span className="hm-rule mt-4" />
          </div>
          <nav aria-label={copy.common.footerNav}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-ink [&:lang(th)]:text-sm [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal">{copy.footer.quick}</h2>
            <ul className="space-y-1">
              {navLinks.map((id) => <li key={id}><Link to={{ pathname: '/', hash: `#${id}` }} className="inline-flex min-h-9 items-center hover:text-brass">{copy.nav[id]}</Link></li>)}
              <li><Link to="/book" className="inline-flex min-h-9 items-center hover:text-brass">{copy.nav.book}</Link></li>
            </ul>
          </nav>
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-ink [&:lang(th)]:text-sm [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal">{copy.footer.contact}</h2>
            <address className="not-italic">{SHOP_FACTS.address}</address>
            <p className="mt-2"><a className="inline-flex min-h-9 items-center font-bold text-ink underline" href={telHref(phone)}>{phone}</a></p>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-ink [&:lang(th)]:text-sm [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal">{copy.footer.hoursTitle}</h2>
            <p>{copy.home.hoursBadge(SHOP_FACTS.opens, SHOP_FACTS.closes)}</p>
            <p className="mt-2">{copy.home.parking}</p>
            <p className="mt-4 text-xs">{copy.footer.manage}</p>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl border-t border-ink/10 pt-5 text-xs">{copy.footer.rights}</p>
      </footer>

      {stickyCta ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-ink/10 bg-paper/95 p-3 backdrop-blur sm:hidden">
          {onlineBookingEnabled ? <Link to="/book" className="flex min-h-11 flex-1 items-center justify-center rounded-sm bg-ink font-bold text-paper">{copy.stickyBar.book}</Link> : null}
          <a href={telHref(phone)} className="flex min-h-11 flex-1 items-center justify-center rounded-sm border border-ink/30 font-bold text-ink">{copy.stickyBar.call}</a>
        </div>
      ) : null}
    </div>
  );
}

/** Centered column for full-page error/recovery states. */
export function PageNotice({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-xl py-6">{children}</div>;
}
