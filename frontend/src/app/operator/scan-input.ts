import { normalizeCode } from '../shared/booking-code';

/**
 * What a scanned QR payload (or a typed value) yields as a booking code, or `null` when the
 * payload is clearly not one. Accepts the two shapes the platform itself produces — the tourist
 * QR's absolute `/booking/{code}` URL and a bare code (same normalization as Find-a-booking) —
 * and, unlike the typed field, rejects other content outright: a camera reads arbitrary
 * third-party QR codes, and forwarding those to the check-in endpoint would be noise. The
 * alphanumeric guard is not a booking-code format check (the server stays the authority); it only
 * screens out payloads carrying URL/punctuation characters no code could contain.
 */
export function codeFromScan(raw: string): string | null {
  const text = raw.trim();
  const bookingPath = /\/booking\/([^/?#]+)/.exec(text);
  const candidate = normalizeCode(bookingPath ? bookingPath[1] : text);
  return candidate.length > 0 && /^[A-Z0-9]+$/.test(candidate) ? candidate : null;
}
