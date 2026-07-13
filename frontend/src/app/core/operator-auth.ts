import { Service, WritableSignal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AUTH_API, AuthPrincipal, SessionAuth, SignInResult, signInResultFor } from './session-auth';

// Re-exported for the operator surfaces + specs that import it from here (the type now lives on the
// shared SessionAuth base, S2 #111).
export type { SignInResult } from './session-auth';

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
