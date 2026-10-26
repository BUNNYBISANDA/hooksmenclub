import type { Locale, Service } from '../../types/api';
import { formatBaht, type Copy } from '../../locales';
import { PlaceholderTag } from './ui';

/** Price/duration as stored by the shop. Null means the owner has not confirmed it: say so, never guess. */
export function priceText(service: Pick<Service, 'priceBaht'>, copy: Copy, locale: Locale): string {
  return service.priceBaht === null ? copy.common.priceTbc : formatBaht(service.priceBaht, locale);
}

export function durationText(service: Pick<Service, 'durationMinutes'>, copy: Copy): string {
  return service.durationMinutes === null ? copy.common.durationTbc : copy.common.minutes(service.durationMinutes);
}

export function ServiceMeta({ service, copy, locale }: { service: Service; copy: Copy; locale: Locale }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span>{priceText(service, copy, locale)}</span>
      <span aria-hidden="true">·</span>
      <span>{durationText(service, copy)}</span>
      {service.isPlaceholder ? <PlaceholderTag copy={copy} /> : null}
    </p>
  );
}

/** Sums only when every selected service has a confirmed value; otherwise returns null so the UI says "to be confirmed". */
export function sumKnown(values: (number | null)[]): number | null {
  let total = 0;
  for (const v of values) {
    if (v === null) return null;
    total += v;
  }
  return total;
}
