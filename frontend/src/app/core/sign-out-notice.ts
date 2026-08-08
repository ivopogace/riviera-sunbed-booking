import { computed, Service, signal } from '@angular/core';

import type { SessionAuth } from './session-auth';

/**
 * Carries the one fact a failed sign-out has to surface: the server may still hold this
 * device's session. The shell renders it as a warning with a retry, and it lives in `core/` because
 * both principal types and several surfaces (the tourist shell, the operator console) sign out —
 * a feature folder would have to import another feature's state to share it.
 *
 * <p>{@link SessionAuth} records into this itself on every sign-out, so no call site has to remember
 * to. That matters: the bug being fixed is precisely that a failure was silently dropped, and a
 * design where each caller opts in would reintroduce it the next time a surface adds a sign-out
 * button.
 */
@Service()
export class SignOutNotice {
  /** The auth service whose sign-out may not have reached the server, if any. */
  private readonly unconfirmed = signal<SessionAuth | undefined>(undefined);

  /** Whether to warn that the server session may still be alive on this device. */
  readonly visible = computed(() => this.unconfirmed() !== undefined);

  /** Record a sign-out's outcome; a confirmed sign-out clears any earlier warning. */
  record(auth: SessionAuth, mayPersist: boolean): void {
    this.unconfirmed.set(mayPersist ? auth : undefined);
  }

  /**
   * Try the sign-out again; the warning clears only if the server confirms this time. The result is
   * read here rather than left to {@link record} firing again, so the warning's lifecycle does not
   * depend on the auth service calling back — the implicit version silently never cleared.
   */
  async retry(): Promise<void> {
    const auth = this.unconfirmed();
    if (auth && (await auth.signOut()) === 'signed-out') {
      this.unconfirmed.set(undefined);
    }
  }

  /** Dismiss without another attempt — the person has decided the risk is theirs to accept. */
  dismiss(): void {
    this.unconfirmed.set(undefined);
  }
}
