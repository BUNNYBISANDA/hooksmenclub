import type { ApiErrorCode, Locale } from '../types/api';
import { en } from './en';
import { th, type Copy } from './th';

export type { Copy };
export { SHOP_FACTS, mapsUrl, telHref } from './facts';
export * from './format';

const dictionaries: Record<Locale, Copy> = { th, en };

export function getCopy(locale: Locale): Copy {
  return dictionaries[locale];
}

export const API_ERROR_CODES: readonly ApiErrorCode[] = [
  'INVALID_INPUT', 'SLOT_UNAVAILABLE', 'BOOKING_CLOSED', 'INVALID_LINK', 'CHANGE_WINDOW_CLOSED', 'BOOKING_NOT_CHANGEABLE',
  'RATE_LIMITED', 'CAPTCHA_FAILED', 'IDEMPOTENCY_CONFLICT', 'STALE_BOOKING', 'NOT_CONFIGURED', 'NETWORK_ERROR', 'INTERNAL_ERROR',
];

/**
 * Maps whatever the API adapter throws to a contract error code. Aborts return null (callers ignore them).
 * Only the code is read: error messages and payloads can contain customer data or tokens and are never surfaced.
 */
export function readErrorCode(error: unknown): ApiErrorCode | null {
  if (error && typeof error === 'object') {
    if ((error as { name?: unknown }).name === 'AbortError') return null;
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && (API_ERROR_CODES as readonly string[]).includes(code)) return code as ApiErrorCode;
  }
  if (error instanceof TypeError) return 'NETWORK_ERROR';
  return 'INTERNAL_ERROR';
}
