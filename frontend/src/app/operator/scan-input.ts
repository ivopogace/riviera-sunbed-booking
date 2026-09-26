import { normalizeCode } from '../shared/booking-code';

/**
 * The booking code in a scanned QR payload (the tourist QR's `/booking/{code}` URL, or a bare code
 * normalized as Find-a-booking does), or `null` for third-party content a camera may read. The
 * alphanumeric screen is not a format check — the server stays the authority on codes.
 */
export function codeFromScan(raw: string): string | null {
  const text = raw.trim();
  const bookingPath = /\/booking\/([^/?#]+)/.exec(text);
  const candidate = normalizeCode(bookingPath ? bookingPath[1] : text);
  return candidate.length > 0 && /^[A-Z0-9]+$/.test(candidate) ? candidate : null;
}
