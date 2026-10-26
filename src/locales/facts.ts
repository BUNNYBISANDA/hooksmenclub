/** Verbatim business facts from docs/CLAUDE_HANDOFF.md. Used only as a fallback when the catalog cannot load; the catalog's ShopSettings are authoritative otherwise. */
export const SHOP_FACTS = {
  name: 'Hook Menclub',
  address: '888/88 โครงการเจ้าสัว 69 ถ.บางบอน 3, แขวงหลักสอง เขตบางแค กรุงเทพฯ 10160',
  latitude: 13.6884457,
  longitude: 100.3824744,
  phone: '099 059 2205',
  phoneHref: 'tel:0990592205',
  opens: '10:30',
  closes: '19:30',
  rating: 4.7,
  reviewCount: 27,
} as const;

export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}
