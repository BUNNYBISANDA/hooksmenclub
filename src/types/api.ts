/** Stable customer API v1. Codex owns this file; coordinate changes in docs/API_CONTRACT.md. */
export type Locale = 'th' | 'en';
export type LocalizedText = Record<Locale, string>;
export type BookingStatus = 'confirmed' | 'arrived' | 'in_service' | 'completed' | 'no_show' | 'cancelled';
export type ApiErrorCode = 'INVALID_INPUT' | 'SLOT_UNAVAILABLE' | 'BOOKING_CLOSED' | 'INVALID_LINK' | 'CHANGE_WINDOW_CLOSED' | 'BOOKING_NOT_CHANGEABLE' | 'RATE_LIMITED' | 'CAPTCHA_FAILED' | 'IDEMPOTENCY_CONFLICT' | 'STALE_BOOKING' | 'NOT_CONFIGURED' | 'NETWORK_ERROR' | 'INTERNAL_ERROR';
export interface Service { id: string; name: LocalizedText; description: LocalizedText; priceBaht: number | null; durationMinutes: number | null; isPlaceholder: boolean; bookable: boolean }
export interface Barber { id: string; name: LocalizedText; specialties: LocalizedText; photoUrl: string | null; serviceIds: string[]; isPlaceholder: boolean }
export interface GalleryItem { id: string; imageUrl: string | null; caption: LocalizedText; category: 'haircut' | 'before_after' | 'kids'; pairId: string | null; isPlaceholder: boolean }
export interface ShopSettings {
  name: string; address: string; phone: string; latitude: number; longitude: number;
  timezone: 'Asia/Bangkok'; rating: number; reviewCount: number;
  hours: { weekday: number; opens: string; closes: string; closed: boolean }[];
  cancellationHours: number; slotStepMinutes: number; minimumNoticeMinutes: number; bookingHorizonDays: number;
  onlineBookingEnabled: boolean; lineUrl: string | null; googleReviewUrl: string | null;
  features: Record<'walkInQueue' | 'deposits' | 'loyalty' | 'vouchers' | 'products' | 'waitlist', boolean>;
}
export interface Catalog { shop: ShopSettings; services: Service[]; barbers: Barber[]; gallery: GalleryItem[]; mode: 'live' | 'fixtures' }
export interface AvailabilityRequest { serviceIds: string[]; barberId: string | null; date: string /* YYYY-MM-DD Bangkok */; management?: ManageBookingRequest }
export interface Slot { startsAt: string /* ISO UTC */; endsAt: string; barberIds: string[] }
export interface Availability { date: string; timezone: 'Asia/Bangkok'; slots: Slot[] }
export interface CreateBookingRequest {
  serviceIds: string[]; barberId: string | null; startsAt: string;
  customer: { name: string; phone: string; locale: Locale; marketingOptIn: boolean };
  note?: string; turnstileToken: string; idempotencyKey: string;
  manageToken: string /* 32 secure random bytes, base64url; generate once per submission intent */;
}
export interface BookingView {
  id: string; reference: string; status: BookingStatus; startsAt: string; endsAt: string;
  barber: { id: string; name: LocalizedText }; services: { id: string; name: LocalizedText; priceBaht: number; durationMinutes: number }[];
  customerName: string; totalBaht: number; cancellationDeadline: string; canChange: boolean; revision: number;
}
export interface CreateBookingResult { booking: BookingView; mode: 'live' | 'fixtures' }
export interface ManageBookingRequest { bookingId: string; token: string }
export interface CancelBookingRequest extends ManageBookingRequest { reason?: string; expectedRevision: number }
export interface RescheduleBookingRequest extends ManageBookingRequest { startsAt: string; barberId: string | null; expectedRevision: number }
export interface CustomerApi {
  getCatalog(signal?: AbortSignal): Promise<Catalog>;
  getAvailability(input: AvailabilityRequest, signal?: AbortSignal): Promise<Availability>;
  createBooking(input: CreateBookingRequest): Promise<CreateBookingResult>;
  getBooking(input: ManageBookingRequest): Promise<BookingView>;
  cancelBooking(input: CancelBookingRequest): Promise<BookingView>;
  rescheduleBooking(input: RescheduleBookingRequest): Promise<BookingView>;
}
