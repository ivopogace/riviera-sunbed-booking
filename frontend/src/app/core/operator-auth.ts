import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, WritableSignal, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

/** The signed-in principal as the backend reports it (`POST …/login` and `GET /api/auth/me`). */
interface AuthPrincipal {
  readonly username: string;
  readonly principalType: string;
}

/** How a sign-in attempt ended, for the surface to translate into a message. */
export type SignInResult = 'signed-in' | 'invalid-credentials' | 'rate-limited' | 'error';

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

const AUTH_API = `${environment.apiBaseUrl}/api/auth`;

/**
 * Session-aware operator auth state (issue #109, design D-1). The browser holds NO credential:
 * `signIn` posts username/password once to the session login endpoint and the backend answers
 * with an `HttpOnly` session cookie the browser attaches from then on ({@link apiSessionInterceptor}
 * adds `withCredentials` + the CSRF header). On construction the state is restored from
 * `GET /api/auth/me` — so, unlike the retired Basic-in-memory model, a signed-in operator
 * survives a page reload; a `401` there simply means "signed out" (expected state, not an error).
 * Sign-out invalidates the session server-side.
 */
@Service()
export class OperatorAuth {
  private readonly http = inject(HttpClient);

  private readonly principal = signal<AuthPrincipal | undefined>(undefined);

  /** True while the initial current-principal restore is in flight (surfaces can hold rendering). */
  readonly restoring = signal(true);
  /** Whether an operator session is established (as far as this tab knows). */
  readonly signedIn = computed(() => this.principal() !== undefined);
  /** The signed-in operator's username, or undefined when signed out. */
  readonly username = computed(() => this.principal()?.username);

  /**
   * Fire the one-time session restore at construction (issue #109). Kept in a FIELD INITIALIZER — a
   * valid Angular injection context, listed distinctly from the constructor
   * (angular.dev/guide/di/dependency-injection-context) — rather than the constructor BODY, so no
   * async operation runs *in the constructor* (Sonar typescript:S7059 / no-async-constructor) while
   * behaviour is preserved EXACTLY: it still fires once when this service is first injected —
   * lazily, so anonymous tourist pages that never inject OperatorAuth issue no /me call — and the
   * `restoring` signal (declared above, starts true) holds rendering until GET /api/auth/me settles.
   * Declared after the deps + signals it reads.
   */
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
      this.principal.set(principal);
      return 'signed-in';
    } catch (error) {
      this.principal.set(undefined);
      if (error instanceof HttpErrorResponse && error.status === 401) {
        return 'invalid-credentials';
      }
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      return 'error';
    }
  }

  /** Invalidate the server session; local state clears even if the session was already gone. */
  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(`${AUTH_API}/logout`, null));
    } catch {
      // A failed logout (expired session, network) still means "signed out" for this tab.
    }
    this.principal.set(undefined);
  }

  /**
   * Called by surfaces when the backend answers 401 mid-flow (session expired/invalidated
   * elsewhere): drops the local state WITHOUT a logout round-trip.
   */
  sessionLost(): void {
    this.principal.set(undefined);
  }

  private async restore(): Promise<void> {
    try {
      this.principal.set(
        await firstValueFrom(this.http.get<AuthPrincipal>(`${AUTH_API}/me`)),
      );
    } catch {
      this.principal.set(undefined); // 401 = signed out; also the CSRF cookie got seeded either way
    } finally {
      this.restoring.set(false);
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
 * venue-editor / staff-daily handler (those retire onto this in O6/O8). No-ops while a field is blank
 * or a sign-in is already in flight; clears the password on success and sets the generic
 * {@link signInFailureMessage} on failure.
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
