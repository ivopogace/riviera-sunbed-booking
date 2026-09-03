/**
 * The password policy the server enforces on every surface that accepts a new password (register on
 * both sides, reset, set, both self-service changes), mirrored client-side so the screens can say the
 * rule before submit and name the failed rule after. The server is authoritative: it answers
 * `INVALID_REQUEST` for the length rule and {@link PASSWORD_BLOCKED_TERM_CODE} for the blocklist.
 * Pure — no HTTP, no app state — so both core auth services and every password screen share it.
 */

/** The minimum length in characters — length is the primary control, there are no composition rules. */
export const PASSWORD_MIN_LENGTH = 12;
/** The maximum in UTF-8 bytes, bcrypt's input cap — an accented passphrase can exceed it well under 72 characters. */
export const PASSWORD_MAX_BYTES = 72;
/** The service name, blocked in any case on every surface. */
export const PASSWORD_BLOCKED_WORD = 'riviera';
/** An account name shorter than this is not applied as a blocked term — it would match almost anything. */
export const PASSWORD_MIN_ACCOUNT_NAME_LENGTH = 3;
/** The problem `code` the server answers when the password contains a blocked term. */
export const PASSWORD_BLOCKED_TERM_CODE = 'PASSWORD_CONTAINS_BLOCKED_TERM';

/** Shown beside the field before submit, on every screen where a password is chosen. */
export const PASSWORD_POLICY_HINT =
  'At least 12 characters. It can’t contain the name you sign in with or the word “riviera”.';
/** The length rule failed — the server's `INVALID_REQUEST`, or the client-side minimum. */
export const PASSWORD_LENGTH_MESSAGE = 'Choose a password of 12–72 characters.';
/** The byte cap failed client-side, where the character count on screen would contradict the length message. */
export const PASSWORD_TOO_LONG_MESSAGE =
  'That password is too long. Accented letters and emoji each take several of the 72 available characters, so try a shorter one.';
/** The blocklist failed — the server's {@link PASSWORD_BLOCKED_TERM_CODE}, or the client-side check. */
export const PASSWORD_BLOCKED_MESSAGE =
  'That password contains the name you sign in with or the word “riviera”. Choose a different one.';

/** Which rule a candidate password fails, when it fails one. */
export type PasswordPolicyViolation = 'too-short' | 'too-long' | 'blocked';

/** Byte length under UTF-8, which is what the server's 72-byte bcrypt cap actually measures. */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

/** The part of an email before the `@`, lower-cased — the name a tourist signs in with. */
export function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return (at < 0 ? email : email.slice(0, at)).toLowerCase();
}

/**
 * The client-side check every password screen runs before spending a request. `accountName` is the
 * name the account signs in with (the email's local part, or the operator username) when the screen
 * knows it; the server always applies it. Rules run in the server's order: length, then the blocklist.
 */
export function passwordPolicyViolation(
  password: string,
  accountName?: string,
): PasswordPolicyViolation | undefined {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return 'too-short';
  }
  if (passwordByteLength(password) > PASSWORD_MAX_BYTES) {
    return 'too-long';
  }
  const lower = password.toLowerCase();
  if (lower.includes(PASSWORD_BLOCKED_WORD)) {
    return 'blocked';
  }
  const name = accountName?.toLowerCase() ?? '';
  if (name.length >= PASSWORD_MIN_ACCOUNT_NAME_LENGTH && lower.includes(name)) {
    return 'blocked';
  }
  return undefined;
}

/** The one message per failed rule, the same wording on every screen. */
export function passwordPolicyMessage(violation: PasswordPolicyViolation): string {
  switch (violation) {
    case 'too-short':
      return PASSWORD_LENGTH_MESSAGE;
    case 'too-long':
      return PASSWORD_TOO_LONG_MESSAGE;
    case 'blocked':
      return PASSWORD_BLOCKED_MESSAGE;
  }
}
