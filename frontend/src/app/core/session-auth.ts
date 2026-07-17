import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

/** The signed-in principal as the backend reports it (`POST …/login|register` and `GET /api/auth/me`). */
export interface AuthPrincipal {
  readonly username: string;
  readonly principalType: string;
  /** Soft email-verification state (S8 #113) — customer-only; `null` for an operator principal. */
  readonly emailVerified?: boolean | null;
}

/** How a sign-in attempt ended, for the surface to translate into a message. */
export type SignInResult = 'signed-in' | 'invalid-credentials' | 'rate-limited' | 'error';

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
 * Session-aware auth state for ONE principal type (S2 #111 — the shared base of {@link OperatorAuth}
 * and {@link CustomerAuth}, extracted so the ~80 lines of restore/logout/session-state logic live
 * once). The browser holds NO credential: a subclass posts to its principal-typed login endpoint and
 * the backend answers with an `HttpOnly` session cookie the browser then attaches
 * ({@link apiSessionInterceptor} adds `withCredentials` + the CSRF header). On construction the
 * subclass restores from `GET /api/auth/me`, so a signed-in principal survives a page reload; a `401`
 * there just means "signed out" (expected state, not an error).
 *
 * <p><strong>Principal-type isolation (review F2):</strong> `/me` is polymorphic (it returns whichever
 * principal owns the session), so this base adopts a `/me` principal ONLY when its {@link principalType}
 * matches — an operator session never makes the customer service signed-in, and a customer session
 * never drives the operator console. Each subclass declares its own type.
 */
export abstract class SessionAuth {
  protected readonly http = inject(HttpClient);

  private readonly principal = signal<AuthPrincipal | undefined>(undefined);

  /** True while the initial current-principal restore is in flight (surfaces can hold rendering). */
  readonly restoring = signal(true);
  /** Whether a session of THIS principal type is established (as far as this tab knows). */
  readonly signedIn = computed(() => this.principal() !== undefined);
  /** The signed-in principal's name (operator username / customer email), or undefined. */
  readonly principalName = computed(() => this.principal()?.username);
  /** The signed-in principal's soft email-verified state (S8 #113), or undefined when unknown/signed out. */
  readonly emailVerified = computed(() => this.principal()?.emailVerified ?? undefined);

  /** The principal type this service owns; a `/me` principal is adopted only when it matches (F2). */
  protected abstract readonly principalType: string;

  /** Adopt a principal from a successful login response (the caller has verified the type). */
  protected setPrincipal(principal: AuthPrincipal | undefined): void {
    this.principal.set(principal);
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

  /**
   * One-time startup restore; the subclass fires this from a field initializer (once type is set).
   * Kept at a single {@code await} depth (like the pre-#111 OperatorAuth) so surfaces that settle it
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

  /** Adopt a `/me` principal ONLY when it is THIS service's {@link principalType} (F2 guard). */
  private adopt(principal: AuthPrincipal): void {
    this.principal.set(principal.principalType === this.principalType ? principal : undefined);
  }
}
