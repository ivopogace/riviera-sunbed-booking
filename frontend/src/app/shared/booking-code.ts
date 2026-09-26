/**
 * Normalize a typed or scanned booking code (10-char Crockford base32, no prefix or dash) before
 * lookup: trim, uppercase (the stored form), strip stray spaces/dashes. Deliberately NO format
 * regex: a brittle client check risks rejecting a valid code; the server 404 is the authority.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}
