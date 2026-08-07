import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { SignOutNotice } from './sign-out-notice';

/** The signed-in principal as the backend reports it (`POST …/login|register` and `GET /api/auth/me`). */
export interface AuthPrincipal {
  readonly username: string;
  readonly principalType: string;
  /** Soft email-verification state — customer-only; `null` for an operator principal. */
  readonly emailVerified?: boolean | null;
  /** Platform-admin flag — `true` for an operator with `ROLE_ADMIN`; the FE gates the approval surface on it. */
  readonly admin?: boolean;
}

/** How a sign-in attempt ended, for the surface to translate into a message. */
export type SignInResult = 'signed-in' | 'invalid-credentials' | 'rate-limited' | 'error';

/**
 * How a sign-out ended. `signed-out` means the server confirmed it; `may-persist` means the
 * request never got a confirmation, so this device's session cookie may still be live.
 */
export type SignOutResult = 'signed-out' | 'may-persist';

export const AUTH_API = `${environment.apiBaseUrl}/api/auth`;

/** Map a failed login/HTTP error to a {@link SignInResult} (generic — the backend never says why, D-8). */
export function signInResultFor(error: unknown): SignInResult {
  if (error instanceof HttpErrorResponse && error.status === 401) {
    return 'invalid-credentials';
  }
  if (error instanceof HttpErrorResponse && error.status === 429) {
    return 'rate-limited';
  }
  return 'error';
}

/**
 * Session-aware auth state for ONE principal type (the shared base of {@link OperatorAuth}
 * and {@link CustomerAuth}, extracted so the ~80 lines of restore/logout/session-state logic live
 * once). The browser holds NO credential: a subclass posts to its principal-typed login endpoint and
 * the backend answers with an `HttpOnly` session cookie the browser then attaches
 * ({@link apiSessionInterceptor} adds `withCredentials` + the CSRF header). On construction the
 * subclass restores from `GET /api/auth/me`, so a signed-in principal survives a page reload; a `401`
 * there just means "signed out" (expected state, not an error).
 *
 * <p><strong>Principal-type isolation:</strong> `/me` is polymorphic (it returns whichever
 * principal owns the session), so this base adopts a `/me` principal ONLY when its {@link principalType}
 * matches — an operator session never makes the customer service signed-in, and a customer session
 * never drives the operator console. Each subclass declares its own type.
 */
export abstract class SessionAuth {
  protected readonly http = inject(HttpClient);
  private readonly signOutNotice = inject(SignOutNotice);

  private readonly principal = signal<AuthPrincipal | undefined>(undefined);

  /** True while the initial current-principal restore is in flight (surfaces can hold rendering). */
  readonly restoring = signal(true);
  /** Whether a session of THIS principal type is established (as far as this tab knows). */
  readonly signedIn = computed(() => this.principal() !== undefined);
  /** The signed-in principal's name (operator username / customer email), or undefined. */
  readonly principalName = computed(() => this.principal()?.username);
  /** The signed-in principal's soft email-verified state, or undefined when unknown/signed out. */
  readonly emailVerified = computed(() => this.principal()?.emailVerified ?? undefined);
  /** Whether the signed-in principal is a platform admin; false when signed out / not admin. */
  readonly isAdmin = computed(() => this.principal()?.admin ?? false);

  /** The principal type this service owns; a `/me` principal is adopted only when it matches. */
  protected abstract readonly principalType: string;

  /**
   * The subclass's one-time startup restore, assigned from its field initializer. Declared here so
   * {@link whenReady} is available on both principals.
   */
  protected abstract readonly restoreOnStartup: Promise<void>;

  /**
   * Resolves once the initial `GET /api/auth/me` restore has completed — i.e. once {@link signedIn}
   * is trustworthy. **Anything that branches on the session must await this first**: a route guard
   * that reads `signedIn()` while the restore is still in flight sees `false` and bounces a
   * signed-in principal to sign-in on every page reload.
   *
   * Awaiting it also guarantees the CSRF cookie has been bootstrapped (`.spa()` issues `XSRF-TOKEN`
   * on the first API response), so a page that fires a CSRF-protected write on load — the
   * verify-email landing — doesn't race a cold browser to a 403.
   */
  whenReady(): Promise<void> {
    return this.restoreOnStartup;
  }

  /** Adopt a principal from a successful login response (the caller has verified the type). */
  protected setPrincipal(principal: AuthPrincipal | undefined): void {
    this.principal.set(principal);
  }

  /**
   * Invalidate the server session. Local state clears either way — a UI stuck in "signed in" is worse
   * than a stale cookie — but the RESULT says whether the server actually confirmed it.
   *
   * A `401` counts as success: the server has no such session, which is exactly what sign-out wants.
   * Anything else (network error, `5xx`, or the common `403` from a missing/stale XSRF cookie) may
   * have left the `HttpOnly` SESSION cookie alive, so it re-bootstraps CSRF via `GET /api/auth/me`
   * and retries **once**. Still failing, it returns `may-persist` and records a
   * {@link SignOutNotice} the shell surfaces — the shared-device case, where the next visitor would
   * otherwise be silently restored.
   */
  async signOut(): Promise<SignOutResult> {
    const result = await this.logoutWithOneRetry();
    this.principal.set(undefined);
    this.signOutNotice.record(this, result === 'may-persist');
    return result;
  }

  private async logoutWithOneRetry(): Promise<SignOutResult> {
    if (await this.logoutConfirmed()) {
      return 'signed-out';
    }
    await this.loadPrincipal(); // re-issues the XSRF-TOKEN cookie a 403 usually means is missing
    return (await this.logoutConfirmed()) ? 'signed-out' : 'may-persist';
  }

  /** One logout attempt; true when the server session is provably gone (204 or 401). */
  private async logoutConfirmed(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post<void>(`${AUTH_API}/logout`, null));
      return true;
    } catch (error) {
      return error instanceof HttpErrorResponse && error.status === 401;
    }
  }

  /** Drop local state without a logout round-trip (a surface saw a 401 mid-flow). */
  sessionLost(): void {
    this.principal.set(undefined);
  }

  /**
   * One-time startup restore; the subclass fires this from a field initializer (once type is set).
   * Kept at a single {@code await} depth so surfaces that settle it
   * with one microtask / {@code whenStable} still see {@code restoring} flip in the same tick.
   */
  protected async restore(): Promise<void> {
    try {
      this.adopt(await firstValueFrom(this.http.get<AuthPrincipal>(`${AUTH_API}/me`)));
    } catch {
      this.principal.set(undefined); // 401 = signed out (expected state, not an error)
    } finally {
      this.restoring.set(false);
    }
  }

  /**
   * `GET /api/auth/me` and adopt the principal (used after register to learn the true session state).
   * Any error (`401` = signed out) leaves us signed out. Never throws.
   */
  protected async loadPrincipal(): Promise<void> {
    try {
      this.adopt(await firstValueFrom(this.http.get<AuthPrincipal>(`${AUTH_API}/me`)));
    } catch {
      this.principal.set(undefined);
    }
  }

  /** Adopt a `/me` principal ONLY when it is THIS service's {@link principalType}. */
  private adopt(principal: AuthPrincipal): void {
    this.principal.set(principal.principalType === this.principalType ? principal : undefined);
  }
}
