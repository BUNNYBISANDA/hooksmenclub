import type { ApiErrorCode, CustomerApi, ManageBookingRequest } from '../types/api';

export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode, public readonly status = 0) { super(code); this.name = 'ApiError'; }
}

const knownCodes = new Set<ApiErrorCode>(['INVALID_INPUT','SLOT_UNAVAILABLE','BOOKING_CLOSED','INVALID_LINK','CHANGE_WINDOW_CLOSED','BOOKING_NOT_CHANGEABLE','RATE_LIMITED','CAPTCHA_FAILED','IDEMPOTENCY_CONFLICT','STALE_BOOKING','NOT_CONFIGURED','NETWORK_ERROR','INTERNAL_ERROR']);
async function call<T>(endpoint: string, input: unknown, signal?: AbortSignal): Promise<T> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiError('NOT_CONFIGURED');
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify(input), signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body?.error?.code as ApiErrorCode;
    throw new ApiError(knownCodes.has(code) ? code : 'INTERNAL_ERROR', response.status);
  }
  if (!body || !('data' in body)) throw new ApiError('INTERNAL_ERROR', response.status);
  return body.data as T;
}

export const liveApi: CustomerApi = {
  getCatalog: (signal) => call('catalog', {}, signal),
  getAvailability: (input, signal) => input.management
    ? call('manage-booking',{...input.management,action:'availability',date:input.date,barberId:input.barberId},signal)
    : call('availability',input,signal),
  createBooking: (input) => call('create-booking', input),
  getBooking: (input) => call('manage-booking', { ...input, action: 'read' }),
  cancelBooking: (input) => call('manage-booking', { ...input, action: 'cancel' }),
  rescheduleBooking: (input) => call('manage-booking', { ...input, action: 'reschedule' }),
};

// Conditional import lets Vite exclude all synthetic data from the production bundle.
function lazyFixtureApi(): CustomerApi {
  const load = () => import('./fixtures').then(module => module.fixtureApi);
  return {
    getCatalog: async (...args) => (await load()).getCatalog(...args),
    getAvailability: async (...args) => (await load()).getAvailability(...args),
    createBooking: async (...args) => (await load()).createBooking(...args),
    getBooking: async (...args) => (await load()).getBooking(...args),
    cancelBooking: async (...args) => (await load()).cancelBooking(...args),
    rescheduleBooking: async (...args) => (await load()).rescheduleBooking(...args),
  };
}
export const customerApi: CustomerApi = import.meta.env.DEV && import.meta.env.VITE_API_MODE === 'fixtures' ? lazyFixtureApi() : liveApi;

/** Rescheduling uses original snapshots and excludes only the authenticated customer's own booking. */
export function withManagedAvailability(api:CustomerApi,management:ManageBookingRequest):CustomerApi {
  return {...api,getAvailability:(input,signal)=>api.getAvailability({...input,management},signal)};
}
