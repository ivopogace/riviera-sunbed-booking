import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

/** The signed-in principal as the backend reports it (`POST …/login|register` and `GET /api/auth/me`). */
interface AuthPrincipal {
  readonly username: string;
  readonly principalType: string;
}

/** How a customer sign-in attempt ended, for the surface to translate into a message. */
export type CustomerSignInResult = 'signed-in' | 'invalid-credentials' | 'rate-limited' | 'error';

/**
 * How a customer registration ended. `registered` = a fresh account, now signed in; `exists` = the
 * email already had an account (the backend returns an identical body but no session — D-8 — so we
 * learn the truth from `/me`); the rest are input/transport failures.
 */
export type CustomerRegisterResult =
  | 'registered'
  | 'exists'
  | 'invalid-password'
  | 'rate-limited'
  | 'error';

const CUSTOMER_PRINCIPAL_TYPE = 'CUSTOMER';
const AUTH_API = `${environment.apiBaseUrl}/api/auth`;

/**
 * Session-aware customer auth state (epic #108 / S2 #111, design D-1/D-8) — the tourist-side twin of
 * {@link ai.riviera OperatorAuth}. The browser holds NO credential: `signIn`/`register` post once to
 * the principal-typed session endpoints and the backend answers with an `HttpOnly` session cookie the
 * browser then attaches ({@link apiSessionInterceptor} adds `withCredentials` + the CSRF header). On
 * construction the state is restored from `GET /api/auth/me`, so a signed-in customer survives a page
 * reload; a `401` there simply means "signed out" (expected state, not an error). Only a
 * {@code CUSTOMER} principal is adopted — an operator session on `/me` is not this service's concern.
 */
@Service()
export class CustomerAuth {
  private readonly http = inject(HttpClient);

  private readonly principal = signal<AuthPrincipal | undefined>(undefined);

  /** True while the initial current-principal restore is in flight (the shell holds the auth nav). */
  readonly restoring = signal(true);
  /** Whether a customer session is established (as far as this tab knows). */
  readonly signedIn = computed(() => this.principal() !== undefined);
  /** The signed-in customer's email, or undefined when signed out. */
  readonly email = computed(() => this.principal()?.username);

  /**
   * Fire the one-time session restore at construction — a field initializer (a valid injection
   * context), not the constructor body, so no async runs in the constructor (Sonar S7059) while the
   * behaviour is identical: it fires once when the service is first injected (lazily — an anonymous
   * page that never injects CustomerAuth issues no `/me` call) and `restoring` holds the shell's auth
   * nav until `GET /api/auth/me` settles. Declared after the deps + signals it reads.
   */
  private readonly restoreOnStartup = this.restore();

  /** Server-validated sign-in: a wrong credential is a generic 401 (the backend never says why, D-8). */
  async signIn(email: string, password: string): Promise<CustomerSignInResult> {
    try {
      const principal = await firstValueFrom(
        this.http.post<AuthPrincipal>(`${AUTH_API}/customer/login`, { email, password }),
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

  /**
   * Register a customer account. The backend returns 201 for BOTH a fresh email (auto-signed-in, a
   * session cookie set) and an already-registered one (identical body, NO session — non-enumeration,
   * D-8), so the response body can't be trusted for session state: we learn it from `/me`. A session
   * means the account was fresh (`registered`); none means the email already had an account (`exists`).
   */
  async register(email: string, password: string): Promise<CustomerRegisterResult> {
    try {
      await firstValueFrom(
        this.http.post<AuthPrincipal>(`${AUTH_API}/customer/register`, { email, password }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      if (error instanceof HttpErrorResponse && error.status === 400) {
        return 'invalid-password';
      }
      return 'error';
    }
    await this.loadPrincipal();
    return this.signedIn() ? 'registered' : 'exists';
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

  /** Drop local state without a logout round-trip (a surface saw a 401 mid-flow). */
  sessionLost(): void {
    this.principal.set(undefined);
  }

  private async restore(): Promise<void> {
    try {
      await this.loadPrincipal();
    } finally {
      this.restoring.set(false);
    }
  }

  /**
   * `GET /api/auth/me` and adopt the principal ONLY when it is a {@code CUSTOMER} session; an operator
   * session (or any error — `401` = signed out) leaves us signed out. Never throws.
   */
  private async loadPrincipal(): Promise<void> {
    try {
      const principal = await firstValueFrom(this.http.get<AuthPrincipal>(`${AUTH_API}/me`));
      this.principal.set(principal.principalType === CUSTOMER_PRINCIPAL_TYPE ? principal : undefined);
    } catch {
      this.principal.set(undefined);
    }
  }
}

/**
 * The customer-facing message for a FAILED sign-in — one source so every surface says the same thing.
 * Returns undefined for `'signed-in'` (no message). Wording stays generic (D-8).
 */
export function customerSignInMessage(result: CustomerSignInResult): string | undefined {
  switch (result) {
    case 'signed-in':
      return undefined;
    case 'invalid-credentials':
      return 'Sign-in failed. Check your email and password.';
    case 'rate-limited':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'error':
      return 'Something went wrong signing in. Please try again.';
  }
}

/**
 * The customer-facing message for a registration outcome. Returns undefined for `'registered'` (no
 * message — the caller navigates). `'exists'` points the user at sign-in; the residual that this
 * reveals the email exists is the accepted session-cookie trade-off (D-8), gated by rate limiting.
 */
export function customerRegisterMessage(result: CustomerRegisterResult): string | undefined {
  switch (result) {
    case 'registered':
      return undefined;
    case 'exists':
      return 'That email may already have an account. Try signing in instead.';
    case 'invalid-password':
      return 'Choose a password of at least 8 characters.';
    case 'rate-limited':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'error':
      return 'Something went wrong creating your account. Please try again.';
  }
}
