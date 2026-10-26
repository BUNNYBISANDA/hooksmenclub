import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SHOP_FACTS, getCopy, telHref } from '../../locales';
import { CustomerShell } from '../../components/customer/CustomerShell';
import type { CustomerPageProps } from '../../components/customer/types';
import { useCatalog } from '../../components/customer/hooks';
import { Button, ButtonAnchor, ButtonLink, Notice, SkeletonCards, ErrorNotice } from '../../components/customer/ui';
import { BarbersSection, CtaBand, FeatureStrip, FaqSection, GallerySection, PoliciesSection, ServicesSection, VisitSection, fallbackShopView, toShopView } from './sections';

/** Real shop photo from /images/hero.jpg when present; otherwise a labelled illustrated placeholder (never a stock photo). */
function HeroVisual({ label }: { label: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <div className="hm-hero-visual hm-rise hm-rise-2 min-h-72 md:min-h-[34rem]">
      {missing ? (
        <div className="hm-hero-art absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center" role="img" aria-label={label}>
          <svg aria-hidden="true" viewBox="0 0 64 64" className="h-24 w-24 fill-none stroke-current" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="20" cy="46" r="7" /><circle cx="44" cy="46" r="7" /><path d="M24 41 44 10M40 41 20 10" /><path d="M6 20h6M52 20h6" opacity=".5" />
          </svg>
          <p aria-hidden="true" className="max-w-52 text-sm text-paper/70">{label}</p>
        </div>
      ) : (
        <img src="/images/hero.jpg" alt="" onError={() => setMissing(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}

export function HomePage({ api, locale, onLocaleChange }: CustomerPageProps) {
  const copy = getCopy(locale);
  const catalog = useCatalog(api);
  const location = useLocation();

  // Header links navigate to /#section; React Router does not scroll to hashes, so do it once the sections exist.
  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [location.hash, catalog.status]);

  const ready = catalog.status === 'ready' ? catalog.data : null;
  const shop = ready ? toShopView(ready.shop) : fallbackShopView();
  const bookingEnabled = ready ? ready.shop.onlineBookingEnabled : true;
  const rating = shop.rating.toFixed(1);

  return (
    <CustomerShell locale={locale} onLocaleChange={onLocaleChange} title={copy.home.eyebrow} mode={ready?.mode} phone={shop.phone} onlineBookingEnabled={bookingEnabled} stickyCta bare>
      <section aria-labelledby="hero-h" className="hm-hero-wash overflow-hidden">
        <div className="grid items-stretch md:grid-cols-[1fr_1.05fr]">
          <div className="px-4 pb-12 pt-10 sm:pt-16 md:pb-20 md:pl-[max(1rem,calc((100vw-72rem)/2+1rem))]">
            <p className="hm-eyebrow hm-rise">{copy.home.eyebrow}</p>
            <h1 id="hero-h" className="hm-display hm-rise hm-rise-2 mt-5 !leading-[1.02] text-6xl text-ink sm:text-7xl lg:text-8xl">
              Hook <span className="text-brass italic">Menclub</span>
            </h1>
            <span className="hm-rule hm-rise hm-rise-2 mt-6" />
            <p className="hm-rise hm-rise-3 mt-6 max-w-md text-lg text-muted">{copy.home.lead}</p>
            <div className="hm-rise hm-rise-3 mt-8 flex flex-wrap gap-3">
              {bookingEnabled ? (
                <ButtonLink to="/book">{copy.home.ctaBook} →</ButtonLink>
              ) : (
                <ButtonAnchor href={telHref(shop.phone)}>{copy.home.ctaBookDisabled}</ButtonAnchor>
              )}
              <ButtonLink variant="ghost" to={{ pathname: '/', hash: '#services' }}>{copy.home.heroScroll}</ButtonLink>
            </div>
            <p className="hm-rise hm-rise-4 mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span aria-hidden="true" className="tracking-[0.2em] text-gold">★★★★★</span>
              <span>{copy.home.ratingBadge(rating, shop.reviewCount).replace('★ ', '')}</span>
            </p>
            {ready && !ready.shop.onlineBookingEnabled ? (
              <Notice tone="warn" title={copy.home.bookingClosedTitle} className="mt-6 max-w-md">{copy.home.bookingClosedBody}</Notice>
            ) : null}
          </div>
          <HeroVisual label={copy.home.heroVisual} />
        </div>
      </section>

      {catalog.status !== 'loading' ? <FeatureStrip copy={copy} shop={shop} bookingEnabled={bookingEnabled} /> : null}

      {catalog.status === 'loading' ? (
        <div className="mx-auto max-w-6xl px-4 py-12"><SkeletonCards label={copy.common.loading} /></div>
      ) : null}

      {catalog.status === 'error' ? (
        <div className="mx-auto max-w-6xl px-4 py-8">
          <ErrorNotice copy={copy} code={catalog.code} extra={<p className="mt-1">{copy.home.catalogErrorBody}</p>} actions={<Button variant="ghost" onClick={catalog.reload}>{copy.common.retry}</Button>} />
        </div>
      ) : null}

      {ready ? (
        <>
          <ServicesSection copy={copy} locale={locale} services={ready.services} bookingEnabled={ready.shop.onlineBookingEnabled} />
          <BarbersSection copy={copy} locale={locale} barbers={ready.barbers} />
          <GallerySection copy={copy} locale={locale} gallery={ready.gallery} />
          <CtaBand copy={copy} shop={shop} bookingEnabled={ready.shop.onlineBookingEnabled} />
        </>
      ) : null}

      {catalog.status !== 'loading' ? (
        <>
          <VisitSection copy={copy} locale={locale} shop={shop} />
          <FaqSection copy={copy} shop={shop} />
          <PoliciesSection copy={copy} shop={shop} />
        </>
      ) : null}
    </CustomerShell>
  );
}
