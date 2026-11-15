import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injector, Service } from '@angular/core';
import { catchError, firstValueFrom, from, of, timeout } from 'rxjs';

import {
  ChallengeRejection,
  challengeHeaders,
  challengeRejection,
  challengeRejectionMessage,
  isChallengeRejection,
} from '../shared/challenge';
import { buildLocale, LocaleId } from '../shared/display-locale';
import {
  PASSWORD_BLOCKED_MESSAGE,
  PASSWORD_BLOCKED_TERM_CODE,
  PASSWORD_LENGTH_MESSAGE,
} from '../shared/password-policy';
import {
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  ResetPasswordResult,
  resetPasswordFailure,
  SsoProviderId,
} from './customer-auth';
import { ConsoleVenueMap } from './console-venue-map';
import { OwnedVenues } from './owned-venues';
import { PageNavigation } from './page-navigation';
import {
  AUTH_API,
  AuthPrincipal,
  SessionAuth,
  SignInResult,
  signInResultFor,
  SignOutResult,
} from './session-auth';

// Re-exported for the operator surfaces + specs; the type lives on the shared SessionAuth base.
export type { SignInResult } from './session-auth';

/**
 * How an operator self-registration ended. `submitted` = the registration was accepted and is
 * now awaiting admin approval — deliberately the SAME outcome whether the username was fresh or already
 * taken (non-enumeration, D-8): the backend answers an identical 202 and establishes NO session. The
 * rest are input/transport failures.
 */
export type OperatorRegisterResult =
  | 'submitted'
  | 'invalid-password'
  | 'blocked-password'
  | ChallengeRejection
  | 'rate-limited'
  | 'error';

/**
 * How a self-service password change ended. The three `400`s are distinguished by the problem
 * `code`, never by the status alone — reporting a wrong or omitted current password as a policy violation
 * would send the operator off changing a password that was fine. `bootstrap-managed` is the
 * env-managed bootstrap admin, whose credential rotates via `RIVIERA_OPERATOR_PASSWORD` + restart, not here.
 */
export type OperatorPasswordChangeResult =
  | 'changed'
  | 'missing-current'
  | 'invalid-current'
  | 'invalid-password'
  | 'blocked-password'
  | 'bootstrap-managed'
  | 'not-active'
  | 'rate-limited'
  | 'session-lost'
  | 'error';

/** One linked Google/Apple sign-in of the signed-in operator (`GET /api/auth/operator/sso`). */
export interface OperatorSignInMethod {
  readonly provider: SsoProviderId;
  readonly linkedAt: string;
}

/**
 * How starting a link ended. `started` = the browser is leaving for the provider; the round trip returns to
 * the password page with `?sso=linked` or `?sso=link-failed`. The two password `400`s are told apart by code.
 */
export type OperatorLinkStartResult =
  | 'started'
  | 'missing-current'
  | 'invalid-current'
  | 'bootstrap-managed'
  | 'rate-limited'
  | 'session-lost'
  | 'error';

/** How an unlink ended; `last-credential` is the server keeping the one way left to sign in. */
export type OperatorUnlinkResult = 'unlinked' | 'last-credential' | 'session-lost' | 'error';

/**
 * Shown when the current password is left empty — client-side, or on the server's own
 * `MISSING_CURRENT_PASSWORD` code (never folded into a policy violation's message). Aliases the
 * customer constant, so both principal types share one wording with no copy to desync.
 */
export const OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE = CURRENT_PASSWORD_REQUIRED_MESSAGE;

/**
 * The operator-facing message for a FAILED sign-in — one source so every surface that signs an
 * operator in says the same thing.
 * Returns undefined for `'signed-in'` (no message). Failure wording stays generic (D-8).
 */
export function signInFailureMessage(result: SignInResult): string | undefined {
  switch (result) {
    case 'signed-in':
      return undefined;
    case 'invalid-credentials':
      return $localize`Sign-in failed. Check your username and password.`;
    case 'rate-limited':
      return $localize`Too many sign-in attempts. Please wait a minute and try again.`;
    case 'error':
      return $localize`Something went wrong signing in. Please try again.`;
  }
}

/**
 * The operator tab's notice after a Google/Apple sign-in the backend refused (`?sso=failed`): one wording for an
 * unlinked identity and an account that may not sign in (D-8), pointing at the console's link step.
 */
export const OPERATOR_SSO_FAILED_MESSAGE = $localize`That Google or Apple account isn't linked to an operator account that can sign in. Sign in with your password, then link it under Change password.`;

/**
 * The operator-facing notice when the session has expired mid-action (a `401` on a console call).
 * One source so every operator surface says the same thing.
 */
export const SESSION_EXPIRED_MESSAGE = $localize`Your operator session has expired. Please sign in again.`;

/** How long a language pick waits on its save before the page loads under the new locale anyway. */
export const LOCALE_SAVE_TIMEOUT_MS = 2000;

/**
 * Session-aware operator auth state (design D-1) on the shared {@link SessionAuth} base.
 * `signIn` posts username/password once to the operator session-login endpoint; the
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

  /**
   * True while the signed-in operator awaits admin approval (`operatorStatus === 'PENDING'`):
   * the whole console works, but its venues stay hidden from tourists until approval.
   */
  readonly pendingApproval = computed(() => this.currentPrincipal()?.operatorStatus === 'PENDING');

  /** Fire the one-time restore once `principalType` is set (field-initializer, a valid DI context). */
  protected readonly restoreOnStartup = this.restore();

  private readonly ownedVenues = inject(OwnedVenues);
  private readonly venueMap = inject(ConsoleVenueMap);
  /** Resolved on use: only the SSO starts leave the page, so a spec of anything else provides no seam. */
  private readonly injector = inject(Injector);

  /**
   * Sign out, then drop the per-session caches: the next operator to sign in on this device would
   * otherwise be routed by, shown — and let into the console of — the previous operator's venues.
   * {@link signIn} drops them again on success, so the guarantee never rests on this path alone.
   */
  override async signOut(): Promise<SignOutResult> {
    const result = await super.signOut();
    this.dropSessionCaches();
    return result;
  }

  /** A 401 mid-flow ends the session the caches belong to, exactly as a sign-out does. */
  override sessionLost(): void {
    super.sessionLost();
    this.dropSessionCaches();
  }

  private dropSessionCaches(): void {
    this.ownedVenues.reset();
    this.venueMap.reset();
  }

  /**
   * Server-validated sign-in: unlike the old capture-and-hope Basic flow, a wrong credential is
   * known HERE (generic 401 — the backend never says why, D-8), not on the first write.
   */
  async signIn(username: string, password: string): Promise<SignInResult> {
    try {
      const principal = await firstValueFrom(
        this.http.post<AuthPrincipal>(`${AUTH_API}/operator/login`, { username, password }),
      );
      this.dropSessionCaches();
      this.setPrincipal(principal);
      return 'signed-in';
    } catch (error) {
      this.setPrincipal(undefined);
      return signInResultFor(error);
    }
  }

  /**
   * Self-register a PENDING operator, in the build's locale (its approval notice's). Fresh and taken usernames
   * both get 202, no session (D-8), so the caller then does {@link signIn}; a solved `challenge` goes as a
   * header, its rejections returning as own results.
   */
  async register(
    username: string,
    password: string,
    contactEmail: string,
    challenge?: string,
  ): Promise<OperatorRegisterResult> {
    try {
      await firstValueFrom(
        this.http.post<void>(
          `${AUTH_API}/operator/register`,
          { username, password, contactEmail, locale: buildLocale() },
          { headers: challengeHeaders(challenge) },
        ),
      );
      return 'submitted';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 429) {
        return 'rate-limited';
      }
      if (error instanceof HttpErrorResponse && error.status === 400) {
        const code = (error.error as { code?: string } | null)?.code;
        return (
          challengeRejection(code) ??
          (code === PASSWORD_BLOCKED_TERM_CODE ? 'blocked-password' : 'invalid-password')
        );
      }
      return 'error';
    }
  }

  /**
   * Change this operator's own password, proving the current one. On success the backend
   * destroys every OTHER session of this operator and keeps this one, so no local state changes and
   * the caller stays signed in — the UI's job is to say the other devices were signed out.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<OperatorPasswordChangeResult> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${AUTH_API}/operator/password`, { currentPassword, newPassword }),
      );
      return 'changed';
    } catch (error) {
      return passwordChangeFailure(error);
    }
  }

  /**
   * Store a language pick as the signed-in operator's own, the one its account mail is written in; nothing
   * when no operator is signed in. Never rejects, and settles within {@link LOCALE_SAVE_TIMEOUT_MS}, so a
   * failed or slow save never holds up the switch it rides on.
   */
  saveLocale(locale: LocaleId): Promise<void> {
    return firstValueFrom(
      from(this.storeLocale(locale)).pipe(
        timeout(LOCALE_SAVE_TIMEOUT_MS),
        catchError(() => of(undefined)),
      ),
    );
  }

  private async storeLocale(locale: LocaleId): Promise<void> {
    await this.whenReady();
    if (this.signedIn()) {
      await firstValueFrom(this.http.put<void>(`${AUTH_API}/operator/locale`, { locale }));
    }
  }

  /**
   * Sign in with a linked Google/Apple identity: a full-page navigation to the operator authorize endpoint.
   * The backend lands on `/operator` with a session, or on the operator tab with `?sso=failed` (D-8).
   */
  startSso(provider: SsoProviderId): void {
    this.injector.get(PageNavigation).leaveTo(`${AUTH_API}/operator/sso/${provider}/authorize`);
  }

  /** This operator's linked sign-ins; empty on any failure, so the section still offers every provider. */
  async signInMethods(): Promise<readonly OperatorSignInMethod[]> {
    try {
      return await firstValueFrom(
        this.http.get<OperatorSignInMethod[]>(`${AUTH_API}/operator/sso`),
      );
    } catch {
      return [];
    }
  }

  /** Prove the current password, then leave for the provider to complete the link (ASVS 7.5.1). */
  async startLink(
    provider: SsoProviderId,
    currentPassword: string,
  ): Promise<OperatorLinkStartResult> {
    try {
      const start = await firstValueFrom(
        this.http.post<{ authorizeUrl: string }>(`${AUTH_API}/operator/sso/${provider}/link`, {
          currentPassword,
        }),
      );
      this.injector.get(PageNavigation).leaveTo(start.authorizeUrl);
      return 'started';
    } catch (error) {
      return linkStartFailure(error);
    }
  }

  /** Remove a linked sign-in; the server signs every other device out. */
  async unlink(provider: SsoProviderId): Promise<OperatorUnlinkResult> {
    try {
      await firstValueFrom(this.http.delete<void>(`${AUTH_API}/operator/sso/${provider}`));
      return 'unlinked';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        return 'session-lost';
      }
      if (error instanceof HttpErrorResponse && error.status === 409) {
        return 'last-credential';
      }
      return 'error';
    }
  }

  /**
   * Redeem an admin-issued reset link (`/account/operator-reset?token=…`). Anonymous: success ends every
   * session of that operator server-side, so the page sends them to sign in fresh.
   */
  async resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${AUTH_API}/operator/reset-password`, { token, newPassword }),
      );
      return 'reset';
    } catch (error) {
      return resetPasswordFailure(error);
    }
  }
}

function linkStartFailure(error: unknown): OperatorLinkStartResult {
  if (!(error instanceof HttpErrorResponse)) {
    return 'error';
  }
  if (error.status === 429) {
    return 'rate-limited';
  }
  if (error.status === 401) {
    return 'session-lost';
  }
  switch ((error.error as { code?: string } | null)?.code) {
    case 'MISSING_CURRENT_PASSWORD':
      return 'missing-current';
    case 'INVALID_CURRENT_PASSWORD':
      return 'invalid-current';
    case 'BOOTSTRAP_CREDENTIAL_MANAGED':
      return 'bootstrap-managed';
    default:
      return 'error';
  }
}

/** The operator-facing message for a link start that did not leave for the provider. */
export function operatorLinkStartMessage(result: OperatorLinkStartResult): string | undefined {
  switch (result) {
    case 'started':
      return undefined;
    case 'missing-current':
      return OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE;
    case 'invalid-current':
      return $localize`That current password is incorrect.`;
    case 'bootstrap-managed':
      return $localize`This account's sign-in is managed by the deployment environment and can't be linked.`;
    case 'rate-limited':
      return $localize`Too many attempts. Please wait a minute and try again.`;
    case 'session-lost':
      return SESSION_EXPIRED_MESSAGE;
    case 'error':
      return $localize`Something went wrong starting the link. Please try again.`;
  }
}

function passwordChangeFailure(error: unknown): OperatorPasswordChangeResult {
  if (!(error instanceof HttpErrorResponse)) {
    return 'error';
  }
  if (error.status === 429) {
    return 'rate-limited';
  }
  // A dead session must flow back into SessionAuth, not read as a retryable blip — every other operator
  // surface calls sessionLost() on 401, and without it the guard keeps believing we are signed in.
  if (error.status === 401) {
    return 'session-lost';
  }
  switch ((error.error as { code?: string } | null)?.code) {
    case 'MISSING_CURRENT_PASSWORD':
      return 'missing-current';
    case 'INVALID_CURRENT_PASSWORD':
      return 'invalid-current';
    case 'INVALID_REQUEST':
      return 'invalid-password';
    case PASSWORD_BLOCKED_TERM_CODE:
      return 'blocked-password';
    case 'BOOTSTRAP_CREDENTIAL_MANAGED':
      return 'bootstrap-managed';
    case 'ACCOUNT_NOT_ACTIVE':
      return 'not-active';
    default:
      return 'error';
  }
}

/**
 * The operator-facing message for a password change. `changed` returns the success notice rather than
 * `undefined`, because the other-devices sign-out is the part the operator most needs told.
 */
export function operatorPasswordChangeMessage(result: OperatorPasswordChangeResult): string {
  switch (result) {
    case 'changed':
      return $localize`Your password has been changed. Any other devices signed in as you have been signed out.`;
    case 'missing-current':
      return OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE;
    case 'invalid-current':
      return $localize`That current password is incorrect.`;
    case 'invalid-password':
      return PASSWORD_LENGTH_MESSAGE;
    case 'blocked-password':
      return PASSWORD_BLOCKED_MESSAGE;
    case 'bootstrap-managed':
      return $localize`This account's password is managed by the deployment environment and can't be changed here.`;
    case 'not-active':
      return $localize`This account is not active. Contact a platform admin.`;
    case 'rate-limited':
      return $localize`Too many attempts. Please wait a minute and try again.`;
    case 'session-lost':
      return SESSION_EXPIRED_MESSAGE;
    case 'error':
      return $localize`Something went wrong changing your password. Please try again.`;
  }
}

/**
 * The operator-facing message for a FAILED registration (a success shows the "pending approval" notice,
 * not a message). Wording stays generic (D-8). `invalid-password` echoes the length rule,
 * `blocked-password` the blocklist.
 */
export function operatorRegisterMessage(result: OperatorRegisterResult): string | undefined {
  if (isChallengeRejection(result)) {
    return challengeRejectionMessage(result);
  }
  switch (result) {
    case 'submitted':
      return undefined;
    case 'invalid-password':
      return PASSWORD_LENGTH_MESSAGE;
    case 'blocked-password':
      return PASSWORD_BLOCKED_MESSAGE;
    case 'rate-limited':
      return $localize`Too many attempts. Please wait a minute and try again.`;
    case 'error':
      return $localize`Something went wrong submitting your registration. Please try again.`;
  }
}
