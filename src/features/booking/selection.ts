import type { Barber, Locale } from '../../types/api';
import { createBookingCredentials, normalizeThaiPhone } from '../../lib/booking';

/** Display-side limits only. The server is authoritative and answers INVALID_INPUT for anything it rejects. */
export const NAME_MAX = 100;
export const NOTE_MAX = 500;

export function toggleService(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/** Barbers offering every selected service. With no selection nobody is "eligible" yet. */
export function eligibleBarbers(barbers: Barber[], serviceIds: string[]): Barber[] {
  if (!serviceIds.length) return [];
  return barbers.filter((b) => serviceIds.every((id) => b.serviceIds.includes(id)));
}

/** Keeps a chosen barber only while they still offer every selected service. */
export function reconcileBarber(barberId: string | null, barbers: Barber[], serviceIds: string[]): string | null {
  if (!barberId) return null;
  return eligibleBarbers(barbers, serviceIds).some((b) => b.id === barberId) ? barberId : null;
}

export interface CustomerForm { name: string; phone: string; note: string; marketingOptIn: boolean }
export type FieldKey = 'service' | 'slot' | 'name' | 'phone' | 'note' | 'captcha';
export type FieldErrorCode = 'serviceRequired' | 'slotRequired' | 'nameRequired' | 'nameTooLong' | 'phoneRequired' | 'phoneInvalid' | 'noteTooLong' | 'captchaRequired';
export type FormErrors = Partial<Record<FieldKey, FieldErrorCode>>;

export interface ValidationInput { serviceIds: string[]; slotStartsAt: string | null; form: CustomerForm; captchaOk: boolean }

/** Pure UX validation. Returns errors plus the normalised phone (+66…) to send when the phone is acceptable. */
export function validateBooking(input: ValidationInput): { errors: FormErrors; phone: string | null } {
  const errors: FormErrors = {};
  if (!input.serviceIds.length) errors.service = 'serviceRequired';
  if (!input.slotStartsAt) errors.slot = 'slotRequired';
  const name = input.form.name.trim();
  if (!name) errors.name = 'nameRequired';
  else if (name.length > NAME_MAX) errors.name = 'nameTooLong';
  let phone: string | null = null;
  if (!input.form.phone.trim()) errors.phone = 'phoneRequired';
  else {
    try { phone = normalizeThaiPhone(input.form.phone); } catch { errors.phone = 'phoneInvalid'; }
  }
  if (input.form.note.trim().length > NOTE_MAX) errors.note = 'noteTooLong';
  if (!input.captchaOk) errors.captcha = 'captchaRequired';
  return { errors, phone };
}

export interface SignatureInput { serviceIds: string[]; barberId: string | null; startsAt: string; name: string; phone: string; note: string; marketingOptIn: boolean; locale: Locale }

/** Identifies "the same submission". Any change yields a different signature and therefore new credentials. */
export function submissionSignature(i: SignatureInput): string {
  return JSON.stringify([[...i.serviceIds].sort(), i.barberId, i.startsAt, i.name.trim(), i.phone, i.note.trim(), i.marketingOptIn, i.locale]);
}

export interface CredentialSession {
  /** Same credentials for the same signature (network retries); fresh ones as soon as the signature differs. */
  resolve(signature: string): { idempotencyKey: string; manageToken: string };
  /** Force fresh credentials on next resolve (e.g. IDEMPOTENCY_CONFLICT). */
  rotate(): void;
}

export function createCredentialSession(generate = createBookingCredentials): CredentialSession {
  let current: { signature: string; credentials: ReturnType<typeof createBookingCredentials> } | null = null;
  return {
    resolve(signature) {
      if (!current || current.signature !== signature) current = { signature, credentials: generate() };
      return current.credentials;
    },
    rotate() { current = null; },
  };
}

export interface ConfirmationState { booking: import('../../types/api').BookingView; manageToken: string; mode: 'live' | 'fixtures' }

export function isConfirmationState(value: unknown): value is ConfirmationState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ConfirmationState>;
  const b = v.booking;
  return (v.mode === 'live' || v.mode === 'fixtures') && typeof v.manageToken === 'string' && v.manageToken.length > 0
    && !!b && typeof b.id === 'string' && typeof b.startsAt === 'string' && typeof b.endsAt === 'string' && Array.isArray(b.services);
}
