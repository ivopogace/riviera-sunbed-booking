/**
 * Real booking codes are 10-char Crockford base32 (`SecureRandomBookingCodeGenerator`) — no
 * prefix, no dash. Normalize a typed or scanned code before lookup: trim, uppercase (the stored
 * form), and strip stray spaces/dashes a guest may paste. Deliberately NO strict format regex — a
 * brittle client check risks rejecting a valid code; the server 404 is the authority on
 * unknown/malformed. Promoted from Find-a-booking when the operator scanner became its second
 * consumer (features must not import each other).
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}
