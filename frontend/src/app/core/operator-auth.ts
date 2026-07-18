import { HttpErrorResponse } from '@angular/common/http';
import { Service, WritableSignal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PASSWORD_LENGTH_MESSAGE } from './customer-auth';
import { AUTH_API, AuthPrincipal, SessionAuth, SignInResult, signInResultFor } from './session-auth';

// Re-exported for the operator surfaces + specs that import it from here (the type now lives on the
// shared SessionAuth base, S2 #111).
export type { SignInResult } from './session-auth';

/**
 * How an operator self-registration ended (S6 #115). `submitted` = the registration was accepted and is
 * now awaiting admin approval — deliberately the SAME outcome whether the username was fresh or already
 * taken (non-enumeration, D-8): the backend answers an identical 202 and establishes NO session. The
 * rest are input/transport failures.
 */
export type OperatorRegisterResult = 'submitted' | 'invalid-password' | 'rate-limited' | 'error';

// The FE password policy is ONE rule for both principal types — the backend enforces both via the same
// CustomerPasswords.validate — so source the customer constants rather than redeclare them (a byte-for-byte
// copy would silently desync). The length is re-exported directly (used only by the register component);
// the message is aliased into a local const because operatorRegisterMessage below references it.
export { MIN_PASSWORD_LENGTH as MIN_OPERATOR_PASSWORD_LENGTH } from './customer-auth';
export const OPERATOR_PASSWORD_LENGTH_MESSAGE = PASSWORD_LENGTH_MESSAGE;

/**
 * The operator-facing message for a FAILED sign-in — one source so every auth surface says the
 * same thing (the venue editor, the staff view, and the customer/SSO surfaces epic #108 adds).
 * Returns undefined for `'signed-in'` (no message). Failure wording stays generic (D-8).
 */
export function signInFailureMessage(result: SignInResult): string | undefined {
  switch (result) {
    case 'signed-in':
      return undefined;
    case 'invalid-credentials':
      return 'Sign-in failed. Check your username and password.';
    case 'rate-limited':
      return 'Too many sign-in attempts. Please wait a minute and try again.';
    case 'error':
      return 'Something went wrong signing in. Please try again.';
  }
}

/**
 * The operator-facing notice when the session has expired mid-action (a `401` on a console call).
 * One source so every operator surface — the console tabs, the venue editor — says the same thing.
 */
export const SESSION_EXPIRED_MESSAGE =
  'Your operator session has expired. Please sign in again.';

/**
 * Session-aware operator auth state (issue #109, design D-1) on the shared {@link SessionAuth} base
 * (S2 #111). `signIn` posts username/password once to the operator session-login endpoint; the
 * backend answers with an `HttpOnly` session cookie the browser attaches from then on. On
 * construction the state is restored from `GET /api/auth/me` (filtered to the `OPERATOR` principal by
 * the base — a customer session never makes this service signed-in), so a signed-in operator survives
 * a reload. Sign-out invalidates the session server-side.
 */
@Service()
export class OperatorAuth extends SessionAuth {
  protected readonly principalType = 'OPERATOR';

  /** The signed-in operator's username, or undefined when signed out (the base's principal name). */
  readonly username = this.principalName;

  /** Fire the one-time restore once `principalType` is set (field-initializer, a valid DI context). */
  private readonly restoreOnStartup = this.restore();

  /**
   * Server-validated sign-in: unlike the old capture-and-hope Basic flow, a wrong credential is
   * known HERE (generic 401 — the backend never says why, D-8), not on the first write.
   */
  async signIn(username: string, password: string): Promise<SignInResult> {
    try {
      const principal = await firstValueFrom(
        this.http.post<AuthPrincipal>(`${AUTH_API}/operator/login`, { username, password }),
      );
      this.setPrincipal(principal);
      return 'signed-in';
    } catch (error) {
      this.setPrincipal(undefined);
      return signInResultFor(error);
    }
  }

  /**
   * Self-register an operator account (S6 #115). The backend creates a PENDING account and does NOT
   * sign in — a fresh and an already-taken username both return 202 with no session (non-enumeration,
   * D-8) — so this establishes no principal and always resolves to `submitted` on a 2xx. The account
   * can sign in only once a platform admin approves it.
   */
  async register(
    username: string,
    password: string,
    contactEmail: string,
  ): Promise<OperatorRegisterResult> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${AUTH_API}/operator/register`, { username, password, contactEmail }),
      );
      return 'submitted';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      if (error instanceof HttpErrorResponse && error.status === 400) {
        return 'invalid-password';
      }
      return 'error';
    }
  }
}

/**
 * The operator-facing message for a FAILED registration (a success shows the "pending approval" notice,
 * not a message). Wording stays generic (D-8). `invalid-password` echoes the length policy.
 */
export function operatorRegisterMessage(result: OperatorRegisterResult): string | undefined {
  switch (result) {
    case 'submitted':
      return undefined;
    case 'invalid-password':
      return OPERATOR_PASSWORD_LENGTH_MESSAGE;
    case 'rate-limited':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'error':
      return 'Something went wrong submitting your registration. Please try again.';
  }
}

/** The mutable state an operator sign-in form drives: the in-flight flag, the error message, and the
 *  password field (cleared on success). */
export interface OperatorSignInForm {
  readonly signingIn: WritableSignal<boolean>;
  readonly error: WritableSignal<string | undefined>;
  readonly password: WritableSignal<string>;
}

/**
 * Run an operator sign-in against {@link OperatorAuth}, driving a sign-in form's in-flight / error /
 * password state. Extracted at issue #170 so the operator-console sign-in card doesn't duplicate the
 * venue-editor / staff-daily handler. No-ops while a field is blank or a sign-in is already in flight;
 * clears the password on success and sets the generic {@link signInFailureMessage} on failure.
 */
export async function runOperatorSignIn(
  auth: OperatorAuth,
  username: string,
  password: string,
  form: OperatorSignInForm,
): Promise<void> {
  if (!username || !password || form.signingIn()) {
    return;
  }
  form.signingIn.set(true);
  form.error.set(undefined);
  const result = await auth.signIn(username, password);
  form.signingIn.set(false);
  if (result === 'signed-in') {
    form.password.set('');
  } else {
    form.error.set(signInFailureMessage(result));
  }
}
