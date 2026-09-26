import { HttpErrorResponse } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  ChallengeRejection,
  challengeHeaders,
  challengeRejection,
  challengeRejectionMessage,
  isChallengeRejection,
} from '../shared/challenge';
import {
  PASSWORD_BLOCKED_MESSAGE,
  PASSWORD_BLOCKED_TERM_CODE,
  PASSWORD_LENGTH_MESSAGE,
} from '../shared/password-policy';
import {
  AUTH_API,
  AuthPrincipal,
  SessionAuth,
  SignInResult,
  signInResultFor,
} from './session-auth';
import { SsoProviderId, SsoRedirect } from './sso-redirect';

/** The `/api/me` surface for the signed-in customer's own account writes. */
const ME_API = `${environment.apiBaseUrl}/api/me`;

/**
 * Shown when a current password is required but none was supplied (`MISSING_CURRENT_PASSWORD`),
 * distinct from "incorrect". One constant so the tourist and operator pages word it the same.
 */
export const CURRENT_PASSWORD_REQUIRED_MESSAGE = 'Enter your current password.';

/** How a "forgot password" request ended (always neutral to the user — non-enumeration, D-8). */
export type ForgotPasswordResult = 'sent' | ChallengeRejection | 'rate-limited' | 'error';
/**
 * How a reset-token redemption ended. `invalid-password` is the length rule, `blocked-password` the
 * blocklist — told apart by the problem `code` so the page can name the rule that failed.
 */
export type ResetPasswordResult =
  'reset' | 'invalid-token' | 'invalid-password' | 'blocked-password' | 'rate-limited' | 'error';
/** How an email-verification token redemption ended. */
export type VerifyEmailResult = 'verified' | 'invalid-token' | 'rate-limited' | 'error';
/**
 * How an authenticated set/change-password ended. `missing-current` and `invalid-current` are told apart
 * by the problem `code` alone — collapsing them shows "incorrect" for a field the account left blank.
 */
export type SetPasswordResult =
  | 'set'
  | 'missing-current'
  | 'invalid-current'
  | 'invalid-password'
  | 'blocked-password'
  | 'rate-limited'
  | 'error';
/** How a self-service right-to-erasure ended. */
export type EraseAccountResult = 'erased' | 'error';
/** The verification-resend response body: whether the do-not-email list withheld the message. */
interface VerificationRequested {
  readonly emailWithheld: boolean;
}

/** The stable machine-readable `code` on an RFC-7807 error body (the backend's error contract). */
function problemCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse
    ? (error.error as { code?: string } | null)?.code
    : undefined;
}

/** A 400 from a password-accepting endpoint: the blocklist has its own code, everything else is the length rule. */
function passwordPolicyResult(error: unknown): 'invalid-password' | 'blocked-password' {
  return problemCode(error) === PASSWORD_BLOCKED_TERM_CODE
    ? 'blocked-password'
    : 'invalid-password';
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
  | 'blocked-password'
  | ChallengeRejection
  | 'rate-limited'
  | 'error';

/**
 * Session-aware customer auth state on the shared {@link SessionAuth} base — the
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
   * Start "Continue with Google/Apple": a full-page navigation (via {@link SsoRedirect}, not
   * `HttpClient`) to the backend authorize endpoint. OIDC + PKCE completes server-side and returns
   * with the form-login session cookie, which `restore()` picks up on the return load.
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
   * Register a customer. A fresh and a taken email both answer `201` (D-8), so `/me` decides:
   * `registered` iff the principal's email changed (identity, not `signedIn`: a signed-in user may
   * register anew). Proof-of-work refusals return as their own results, to restart the widget.
   */
  async register(
    email: string,
    password: string,
    challenge?: string,
  ): Promise<CustomerRegisterResult> {
    const previousEmail = this.email();
    try {
      await firstValueFrom(
        this.http.post<AuthPrincipal>(
          `${AUTH_API}/customer/register`,
          { email, password },
          { headers: challengeHeaders(challenge) },
        ),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      if (error instanceof HttpErrorResponse && error.status === 400) {
        return challengeRejection(problemCode(error)) ?? passwordPolicyResult(error);
      }
      return 'error';
    }
    await this.loadPrincipal();
    return this.signedIn() && this.email() !== previousEmail ? 'registered' : 'exists';
  }

  /**
   * Request a reset link. The answer is uniform (non-enumeration, D-8): `sent` never means the
   * account exists. `challenge` is the proof-of-work header; the fence runs before the controller,
   * so its three codes say nothing about the email, and every other failure collapses to `error`.
   */
  async forgotPassword(email: string, challenge?: string): Promise<ForgotPasswordResult> {
    try {
      await firstValueFrom(
        this.http.post<void>(
          `${AUTH_API}/customer/forgot-password`,
          { email },
          { headers: challengeHeaders(challenge) },
        ),
      );
      return 'sent';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      if (error instanceof HttpErrorResponse && error.status === 400) {
        return challengeRejection(problemCode(error)) ?? 'error';
      }
      return 'error';
    }
  }

  /** Redeem a reset token and set a new password. A bad/expired token is distinguished by `code`. */
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
        return problemCode(error) === 'INVALID_OR_EXPIRED_TOKEN'
          ? 'invalid-token'
          : passwordPolicyResult(error);
      }
      return 'error';
    }
  }

  /** Redeem an email-verification token; refresh `emailVerified` if this device is signed in. */
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
   * Set or change the signed-in customer's password. An SSO-only account omits
   * `currentPassword` to set its first one; an account that already has one must supply the correct current —
   * omitting it there is `missing-current`, supplying the wrong one `invalid-current`.
   */
  async setPassword(newPassword: string, currentPassword?: string): Promise<SetPasswordResult> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${ME_API}/password`, {
          newPassword,
          currentPassword: currentPassword ?? null,
        }),
      );
      return 'set';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        switch (problemCode(error)) {
          case 'MISSING_CURRENT_PASSWORD':
            return 'missing-current';
          case 'INVALID_CURRENT_PASSWORD':
            return 'invalid-current';
          default:
            return passwordPolicyResult(error);
        }
      }
      // A 429 needs its own branch: the generic retry advice would invite the exact retry being rejected.
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      return 'error';
    }
  }

  /**
   * Right-to-erasure of the signed-in customer's account + contact PII. The backend scrubs in place
   * (statutory records kept) and revokes every session, so success also runs {@link signOut}
   * locally. Idempotent server-side; a transport failure is `'error'`.
   */
  async eraseAccount(): Promise<EraseAccountResult> {
    try {
      await firstValueFrom(this.http.post<void>(`${ME_API}/erasure`, null));
    } catch {
      return 'error';
    }
    await this.signOut();
    return 'erased';
  }

  /**
   * Re-request a verification email to the signed-in customer's address. `'withheld'`: accepted,
   * but the address is on the do-not-email list, so nothing is sent; `'error'`: the request failed.
   * Only this authenticated endpoint tells them apart; forgot-password stays uninformative (D-8).
   */
  async requestVerification(): Promise<'sent' | 'withheld' | 'error'> {
    try {
      const result = await firstValueFrom(
        this.http.post<VerificationRequested>(`${ME_API}/verify-email/request`, null),
      );
      return result?.emailWithheld ? 'withheld' : 'sent';
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
  if (isChallengeRejection(result)) {
    return challengeRejectionMessage(result);
  }
  switch (result) {
    case 'registered':
      return undefined;
    case 'exists':
      return 'That email may already have an account. Try signing in instead.';
    case 'invalid-password':
      return PASSWORD_LENGTH_MESSAGE;
    case 'blocked-password':
      return PASSWORD_BLOCKED_MESSAGE;
    case 'rate-limited':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'error':
      return 'Something went wrong creating your account. Please try again.';
  }
}
