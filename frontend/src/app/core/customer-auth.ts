import { HttpErrorResponse } from '@angular/common/http';
import { Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AUTH_API, AuthPrincipal, SessionAuth, SignInResult, signInResultFor } from './session-auth';

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

  private readonly restoreOnStartup = this.restore();

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
      return 'Choose a password of 8–72 characters.';
    case 'rate-limited':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'error':
      return 'Something went wrong creating your account. Please try again.';
  }
}
