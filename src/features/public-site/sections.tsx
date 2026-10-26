import { Link } from 'react-router-dom';
import type { Barber, GalleryItem, Locale, Service, ShopSettings } from '../../types/api';
import { SHOP_FACTS, bangkokToday, mapsUrl, telHref, weekdayName, weekdayOf, type Copy } from '../../locales';
import { ServiceMeta } from '../../components/customer/display';
import { ButtonAnchor, ButtonLink, DraftTag, Notice, PlaceholderTag, SectionHeading } from '../../components/customer/ui';

export type ShopView = Pick<ShopSettings, 'address' | 'phone' | 'latitude' | 'longitude' | 'rating' | 'reviewCount' | 'hours' | 'googleReviewUrl'> & {
  /** Null when the catalog could not load: policy values are never guessed. */
  policy: { cancellationHours: number; horizonDays: number; noticeMinutes: number; deposits: boolean } | null;
};

export function toShopView(shop: ShopSettings): ShopView {
  return { ...shop, policy: { cancellationHours: shop.cancellationHours, horizonDays: shop.bookingHorizonDays, noticeMinutes: shop.minimumNoticeMinutes, deposits: shop.features.deposits } };
}

interface Base { copy: Copy; locale: Locale }

export function ServicesSection({ copy, locale, services, bookingEnabled }: Base & { services: Service[]; bookingEnabled: boolean }) {
  return (
    <section aria-labelledby="services-h" id="services" className="scroll-mt-24 py-16"><div className="mx-auto max-w-6xl px-4">
      <SectionHeading id="services-h" title={copy.home.servicesTitle} lead={copy.home.servicesLead} />
      {services.length === 0 ? (
        <Notice title={copy.home.servicesEmpty} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <li key={s.id} className="hm-card flex flex-col border border-ink/10 border-t-2 border-t-gold bg-panel p-6">
              <span aria-hidden="true" className="hm-display text-3xl text-gold">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="hm-display mt-1 text-2xl text-ink">{s.name[locale]}</h3>
              <p className="mt-1 text-muted">{s.description[locale]}</p>
              <ServiceMeta service={s} copy={copy} locale={locale} />
              <div className="mt-4 pt-1">
                {s.bookable && bookingEnabled ? (
                  <Link to={{ pathname: '/book', search: `?service=${encodeURIComponent(s.id)}` }} className="inline-flex min-h-11 items-center font-bold text-brass underline">{copy.home.bookThis}</Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center text-sm text-muted">{copy.home.servicesNotBookable}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div></section>
  );
}

export function BarbersSection({ copy, locale, barbers }: Base & { barbers: Barber[] }) {
  return (
    <section aria-labelledby="barbers-h" id="barbers" className="scroll-mt-24 py-16 bg-sand"><div className="mx-auto max-w-6xl px-4">
      <SectionHeading id="barbers-h" title={copy.home.barbersTitle} lead={copy.home.barbersLead} />
      {barbers.length === 0 ? (
        <Notice title={copy.home.barbersEmpty} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {barbers.map((b) => (
            <li key={b.id} className="overflow-hidden border border-ink/15 bg-panel">
              {b.photoUrl && !b.isPlaceholder ? (
                <img src={b.photoUrl} alt={b.name[locale]} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-ink/[0.07] text-sm text-muted" role="img" aria-label={copy.home.barberPhotoPlaceholder}>
                  <span aria-hidden="true">{copy.home.barberPhotoPlaceholder}</span>
                </div>
              )}
              <div className="p-5">
                <h3 className="text-lg font-bold">{b.name[locale]}</h3>
                <p className="mt-1 text-muted">{b.specialties[locale]}</p>
                {b.isPlaceholder ? <p className="mt-2"><PlaceholderTag copy={copy} /></p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div></section>
  );
}

type GalleryGroup = { key: string; items: GalleryItem[] };

/** Items sharing a pairId are shown together (before/after). Everything else stands alone. */
export function groupGallery(items: GalleryItem[]): GalleryGroup[] {
  const groups: GalleryGroup[] = [];
  const byPair = new Map<string, GalleryGroup>();
  for (const item of items) {
    if (item.pairId) {
      const existing = byPair.get(item.pairId);
      if (existing) { existing.items.push(item); continue; }
      const group = { key: `pair-${item.pairId}`, items: [item] };
      byPair.set(item.pairId, group);
      groups.push(group);
    } else {
      groups.push({ key: item.id, items: [item] });
    }
  }
  return groups;
}

function GalleryFigure({ item, copy, locale }: Base & { item: GalleryItem }) {
  const real = item.imageUrl && !item.isPlaceholder;
  return (
    <figure className="overflow-hidden border border-ink/15 bg-panel">
      {real ? (
        <img src={item.imageUrl!} alt={item.caption[locale]} loading="lazy" className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-ink/[0.07] p-4 text-center text-sm text-muted" role="img" aria-label={`${copy.home.galleryPlaceholderImage}: ${item.caption[locale]}`}>
          <span aria-hidden="true">{copy.home.galleryPlaceholderImage}</span>
        </div>
      )}
      <figcaption className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="text-muted">{copy.home.galleryCategory[item.category]}</span>
        <span>{item.caption[locale]}</span>
        {item.isPlaceholder ? <PlaceholderTag copy={copy} /> : null}
      </figcaption>
    </figure>
  );
}

export function GallerySection({ copy, locale, gallery }: Base & { gallery: GalleryItem[] }) {
  const groups = groupGallery(gallery);
  return (
    <section aria-labelledby="gallery-h" id="gallery" className="scroll-mt-24 py-16"><div className="mx-auto max-w-6xl px-4">
      <SectionHeading id="gallery-h" title={copy.home.galleryTitle} lead={copy.home.galleryLead} />
      {groups.length === 0 ? (
        <Notice title={copy.home.galleryEmpty} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {groups.map((g) => (
            <li key={g.key} className={g.items.length > 1 ? 'col-span-2 grid grid-cols-2 gap-3' : ''}>
              {g.items.map((item) => <GalleryFigure key={item.id} item={item} copy={copy} locale={locale} />)}
            </li>
          ))}
        </ul>
      )}
    </div></section>
  );
}

const featureIcons = {
  rating: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6-4.5-4.2 6.1-.8z" />,
  hours: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  parking: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3" /></>,
  booking: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
} as const;

export function FeatureStrip({ copy, shop, bookingEnabled }: { copy: Copy; shop: ShopView; bookingEnabled: boolean }) {
  const f = copy.home.features;
  const first = shop.hours[0];
  const items = [
    { key: 'rating', ...f.rating(shop.rating.toFixed(1), shop.reviewCount) },
    { key: 'hours', ...f.hours(first?.opens ?? SHOP_FACTS.opens, first?.closes ?? SHOP_FACTS.closes) },
    { key: 'parking', ...f.parking },
    { key: 'booking', ...f.booking(bookingEnabled) },
  ] as const;
  return (
    <section aria-label={copy.home.eyebrow} className="border-y border-ink/10 bg-sand">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 lg:grid-cols-4 lg:divide-x lg:divide-ink/10">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-3 lg:px-6 lg:first:pl-0">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-1 h-7 w-7 shrink-0 fill-none stroke-brass" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{featureIcons[it.key]}</svg>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.08em] text-ink [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal [&:lang(th)]:text-base">{it.title}</p>
              <p className="text-sm text-muted">{it.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CtaBand({ copy, shop, bookingEnabled }: { copy: Copy; shop: ShopView; bookingEnabled: boolean }) {
  const b = copy.home.band;
  return (
    <section aria-labelledby="band-h" className="grid lg:grid-cols-[1.4fr_1fr]">
      <div className="hm-grain relative isolate overflow-hidden bg-ink px-4 py-16 text-paper sm:px-10 lg:px-16">
        <div className="mx-auto max-w-xl lg:ml-auto lg:mr-0">
          <p className="hm-eyebrow !text-gold">{b.kicker}</p>
          <h2 id="band-h" className="hm-display mt-4 text-4xl text-paper sm:text-5xl">{b.title}</h2>
          <p className="mt-4 text-paper/75">{b.body}</p>
        </div>
      </div>
      <div className="flex items-center bg-sand px-4 py-16 sm:px-10">
        <div className="mx-auto w-full max-w-sm lg:mx-0">
          <p className="text-sm font-bold text-brass">{b.cardKicker}</p>
          <p className="hm-display mt-2 text-3xl text-ink">{b.cardTitle}</p>
          <div className="mt-6">
            {bookingEnabled ? <ButtonLink to="/book">{copy.nav.book} →</ButtonLink> : <ButtonAnchor href={telHref(shop.phone)}>{copy.common.callNumber(shop.phone)}</ButtonAnchor>}
          </div>
        </div>
      </div>
    </section>
  );
}

export function fallbackShopView(): ShopView {
  return {
    address: SHOP_FACTS.address, phone: SHOP_FACTS.phone, latitude: SHOP_FACTS.latitude, longitude: SHOP_FACTS.longitude,
    rating: SHOP_FACTS.rating, reviewCount: SHOP_FACTS.reviewCount, googleReviewUrl: null,
    hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: SHOP_FACTS.opens, closes: SHOP_FACTS.closes, closed: false })),
    policy: null,
  };
}

export function VisitSection({ copy, locale, shop }: Base & { shop: ShopView }) {
  const today = weekdayOf(bangkokToday());
  const hours = [...shop.hours].sort((a, b) => a.weekday - b.weekday);
  return (
    <section aria-labelledby="visit-h" id="visit" className="scroll-mt-24 py-16"><div className="mx-auto max-w-6xl px-4">
      <SectionHeading id="visit-h" title={copy.home.visitTitle} />
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-bold text-brass">{copy.home.hoursTitle}</h3>
          <table className="w-full border-collapse text-left">
            <tbody>
              {hours.map((h) => (
                <tr key={h.weekday} className={`border-b border-ink/15 ${h.weekday === today ? 'font-bold text-brass' : ''}`} aria-current={h.weekday === today ? 'date' : undefined}>
                  <th scope="row" className="py-2 pr-3 font-[inherit]">
                    {weekdayName(locale, h.weekday)}
                    {h.weekday === today ? <span className="ml-2 text-xs font-normal">({copy.home.todayTag})</span> : null}
                  </th>
                  <td className="py-2 text-right">{h.closed ? copy.home.closedDay : `${h.opens}–${h.closes}${copy.common.clockSuffix ? ` ${copy.common.clockSuffix}` : ''}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4 border border-ink/15 bg-panel p-5">
          <div>
            <h3 className="font-bold text-brass">{copy.home.addressTitle}</h3>
            <address className="mt-1 not-italic">{shop.address}</address>
            <p className="mt-1 text-muted">{copy.home.parking}</p>
          </div>
          <div>
            <h3 className="font-bold text-brass">{copy.home.phoneTitle}</h3>
            <a className="inline-flex min-h-11 items-center underline" href={telHref(shop.phone)}>{shop.phone}</a>
          </div>
          <div>
            <p className="text-sm text-muted">{copy.home.mapCardTitle}: {shop.latitude}, {shop.longitude}</p>
            <ButtonAnchor className="mt-2" href={mapsUrl(shop.latitude, shop.longitude)} target="_blank" rel="noopener noreferrer">
              {copy.home.openMap}<span className="hm-sr-only"> {copy.common.externalLink}</span>
            </ButtonAnchor>
          </div>
          <div className="border-t border-ink/15 pt-4">
            <h3 className="font-bold text-brass">{copy.home.reviewsTitle}</h3>
            <p>{copy.home.reviewsBody(shop.rating.toFixed(1), shop.reviewCount)}</p>
            {shop.googleReviewUrl ? (
              <a className="inline-flex min-h-11 items-center underline" href={shop.googleReviewUrl} target="_blank" rel="noopener noreferrer">
                {copy.home.reviewsLink}<span className="hm-sr-only"> {copy.common.externalLink}</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div></section>
  );
}

export function FaqSection({ copy, shop }: { copy: Copy; shop: ShopView }) {
  const [first] = shop.hours;
  const p = shop.policy;
  const items = copy
    .faq({
      opens: first?.opens ?? SHOP_FACTS.opens, closes: first?.closes ?? SHOP_FACTS.closes,
      cancellationHours: p?.cancellationHours ?? 0, horizonDays: p?.horizonDays ?? 0, noticeMinutes: p?.noticeMinutes ?? 0,
      phone: shop.phone, deposits: p?.deposits ?? false,
    })
    .filter((item) => p || !item.needsPolicy);
  return (
    <section aria-labelledby="faq-h" id="faq" className="scroll-mt-24 py-16 bg-sand"><div className="mx-auto max-w-6xl px-4">
      <SectionHeading id="faq-h" title={copy.home.faqTitle} />
      <div className="divide-y divide-ink/15 border border-ink/15 bg-panel">
        {items.map((item) => (
          <details key={item.q} className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-medium focus-visible:outline-3 focus-visible:outline-brass">
              <span>{item.q}</span>
              <span aria-hidden="true" className="text-brass transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
            </summary>
            <p className="px-5 pb-4 text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </div></section>
  );
}

export function PoliciesSection({ copy, shop }: { copy: Copy; shop: ShopView }) {
  // terms()[0] is the cancellation-window line; omit it when the catalog (and so the window) is unknown.
  const terms = copy.policies.terms(shop.policy?.cancellationHours ?? 0).slice(shop.policy ? 0 : 1);
  return (
    <section aria-labelledby="policies-h" id="policies" className="scroll-mt-24 py-16"><div className="mx-auto max-w-6xl px-4">
      <SectionHeading id="policies-h" title={copy.home.policiesTitle} />
      <Notice tone="warn" title={copy.home.policiesDraftNotice} className="mb-4" />
      <div className="grid gap-4 md:grid-cols-2">
        <article className="border border-ink/15 bg-panel p-5" aria-labelledby="privacy-h">
          <h3 id="privacy-h" className="mb-2 flex flex-wrap items-center gap-2 font-bold">{copy.policies.privacyTitle} <DraftTag copy={copy} /></h3>
          <ul className="list-disc space-y-2 pl-5 text-muted">{copy.policies.privacy.map((line) => <li key={line}>{line}</li>)}</ul>
        </article>
        <article className="border border-ink/15 bg-panel p-5" aria-labelledby="terms-h">
          <h3 id="terms-h" className="mb-2 flex flex-wrap items-center gap-2 font-bold">{copy.policies.termsTitle} <DraftTag copy={copy} /></h3>
          <ul className="list-disc space-y-2 pl-5 text-muted">{terms.map((line) => <li key={line}>{line}</li>)}</ul>
        </article>
      </div>
    </div></section>
  );
}
