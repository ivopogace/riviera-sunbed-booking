import { HttpErrorResponse } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AUTH_API, AuthPrincipal, SessionAuth, SignInResult, signInResultFor } from './session-auth';
import { SsoProviderId, SsoRedirect } from './sso-redirect';

/** The `/api/me` surface for the signed-in customer's own account writes (S8 #113). */
const ME_API = `${environment.apiBaseUrl}/api/me`;

/**
 * The customer password policy surfaced client-side (the server is authoritative, bcrypt-capped). One
 * source so the constant + the friendly message can't desync across the auth screens.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_LENGTH_MESSAGE = 'Choose a password of 8–72 characters.';

/** How a "forgot password" request ended (always neutral to the user — non-enumeration, D-8). */
export type ForgotPasswordResult = 'sent' | 'rate-limited' | 'error';
/** How a reset-token redemption ended. */
export type ResetPasswordResult =
  | 'reset'
  | 'invalid-token'
  | 'invalid-password'
  | 'rate-limited'
  | 'error';
/** How an email-verification token redemption ended. */
export type VerifyEmailResult = 'verified' | 'invalid-token' | 'rate-limited' | 'error';
/** How an authenticated set/change-password ended. */
export type SetPasswordResult = 'set' | 'invalid-current' | 'invalid-password' | 'error';

/** The stable machine-readable `code` on an RFC-7807 error body (the backend's error contract, #97). */
function problemCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse
    ? (error.error as { code?: string } | null)?.code
    : undefined;
}

/** How a customer sign-in attempt ended (the shared {@link SignInResult}; aliased for the surfaces). */
export type CustomerSignInResult = SignInResult;

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

/**
 * Session-aware customer auth state (epic #108 / S2 #111) on the shared {@link SessionAuth} base — the
 * tourist-side twin of {@link OperatorAuth}. `signIn`/`register` post to the customer session
 * endpoints and the backend answers with an `HttpOnly` session cookie. On construction the state is
 * restored from `GET /api/auth/me`, filtered by the base to the `CUSTOMER` principal (an operator
 * session never makes this service signed-in — and vice versa).
 */
@Service()
export class CustomerAuth extends SessionAuth {
  protected readonly principalType = 'CUSTOMER';

  /** The signed-in customer's email, or undefined when signed out (the base's principal name). */
  readonly email = this.principalName;

  private readonly ssoRedirect = inject(SsoRedirect);
  protected readonly restoreOnStartup = this.restore();

  /**
   * Start "Continue with Google/Apple" (S4, epic #108): a full-page navigation to the backend authorize
   * endpoint. The OIDC Authorization Code + PKCE flow completes server-side and returns to the SPA with a
   * session cookie — the same session as form login — so this deliberately leaves the SPA (via the
   * {@link SsoRedirect} seam) rather than an {@code HttpClient} call; `restore()` then picks up the
   * signed-in state on the return load.
   */
  startSso(provider: SsoProviderId): void {
    this.ssoRedirect.go(`${AUTH_API}/sso/${provider}/authorize`);
  }

  /** Server-validated sign-in: a wrong credential is a generic 401 (the backend never says why, D-8). */
  async signIn(email: string, password: string): Promise<CustomerSignInResult> {
    try {
      const principal = await firstValueFrom(
        this.http.post<AuthPrincipal>(`${AUTH_API}/customer/login`, { email, password }),
      );
      this.setPrincipal(principal);
      return 'signed-in';
    } catch (error) {
      this.setPrincipal(undefined);
      return signInResultFor(error);
    }
  }

  /**
   * Register a customer account. The backend returns 201 for BOTH a fresh email (auto-signed-in, a
   * session cookie set) and an already-registered one (identical body, NO session — non-enumeration,
   * D-8), so we learn the session state from `/me`. A fresh account is a signed-out → signed-in
   * transition; if we were ALREADY signed in (a live session opened `/account/register`), a taken email
   * leaves us signed in unchanged, so we must NOT read that as a new account (review F3).
   */
  async register(email: string, password: string): Promise<CustomerRegisterResult> {
    const wasSignedIn = this.signedIn();
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
    return !wasSignedIn && this.signedIn() ? 'registered' : 'exists';
  }

  /**
   * Request a password-reset link (S8 #113). The response is deliberately uniform (non-enumeration,
   * D-8), so a success here means "if that email has an account, a link was sent" — never that it exists.
   */
  async forgotPassword(email: string): Promise<ForgotPasswordResult> {
    try {
      await firstValueFrom(this.http.post<void>(`${AUTH_API}/customer/forgot-password`, { email }));
      return 'sent';
    } catch (error) {
      return error instanceof HttpErrorResponse && error.status === 429 ? 'rate-limited' : 'error';
    }
  }

  /** Redeem a reset token and set a new password (S8 #113). A bad/expired token is distinguished by `code`. */
  async resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${AUTH_API}/customer/reset-password`, { token, newPassword }),
      );
      return 'reset';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      if (error instanceof HttpErrorResponse && error.status === 400) {
        return problemCode(error) === 'INVALID_OR_EXPIRED_TOKEN' ? 'invalid-token' : 'invalid-password';
      }
      return 'error';
    }
  }

  /** Redeem an email-verification token (S8 #113); refresh `emailVerified` if this device is signed in. */
  async verifyEmail(token: string): Promise<VerifyEmailResult> {
    try {
      await firstValueFrom(this.http.post<void>(`${AUTH_API}/customer/verify-email`, { token }));
      if (this.signedIn()) {
        await this.loadPrincipal(); // pick up the flipped emailVerified for the account page/nudge
      }
      return 'verified';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      return error instanceof HttpErrorResponse && error.status === 400 ? 'invalid-token' : 'error';
    }
  }

  /**
   * Set or change the signed-in customer's password (S8 #113, closes S4 F-1). An SSO-only account omits
   * `currentPassword` to set its first one; an account that already has one must supply the correct current.
   */
  async setPassword(newPassword: string, currentPassword?: string): Promise<SetPasswordResult> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${ME_API}/password`, { newPassword, currentPassword: currentPassword ?? null }),
      );
      return 'set';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        return problemCode(error) === 'INVALID_CURRENT_PASSWORD' ? 'invalid-current' : 'invalid-password';
      }
      return 'error';
    }
  }

  /** Re-request a verification email to the signed-in customer's own address (S8 #113). */
  async requestVerification(): Promise<'sent' | 'error'> {
    try {
      await firstValueFrom(this.http.post<void>(`${ME_API}/verify-email/request`, null));
      return 'sent';
    } catch {
      return 'error';
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
      return PASSWORD_LENGTH_MESSAGE;
    case 'rate-limited':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'error':
      return 'Something went wrong creating your account. Please try again.';
  }
}
