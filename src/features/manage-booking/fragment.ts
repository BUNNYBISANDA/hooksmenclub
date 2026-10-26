const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 32 random bytes, base64url without padding. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface ManageLink { bookingId: string; token: string }

/** Parses `#booking=<uuid>&token=<base64url>`. Returns null for anything missing or malformed. */
export function parseManageFragment(hash: string): ManageLink | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const bookingId = params.get('booking');
  const token = params.get('token');
  if (!bookingId || !token || !UUID.test(bookingId) || !TOKEN.test(token)) return null;
  return { bookingId, token };
}
