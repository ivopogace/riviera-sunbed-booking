import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChunkLoadRecovery } from '../../core/chunk-load-recovery';
import { AlertIcon } from '../../shared/alert-icon';
import { CardGlass } from '../../shared/card-glass';
import { FAILURE_DIRECTIVES } from '../../shared/failure-panel';
import { focusMover } from '../../shared/focus-after-render';
import { RetryButton } from '../../shared/retry-button';
import { TouchTarget } from '../../shared/touch-target';

/**
 * The answer to a lazy route whose chunk failed to load (#1543), rendered in the outlet by
 * `core/chunk-load-recovery.ts`. Neutral while a reload is in flight; otherwise, under the
 * target's own URL, the shared failure panel with "Try again" (a fresh load of the target) and
 * the way back to the beaches. Eager in `app.routes.ts`: this page must never need a chunk itself.
 */
@Component({
  selector: 'app-page-load-failed',
  imports: [RouterLink, AlertIcon, CardGlass, RetryButton, TouchTarget, ...FAILURE_DIRECTIVES],
  template: `
    @if (recovery.reloading()) {
      <section
        appCardGlass
        class="mx-auto my-8 max-w-[460px] rounded-[28px] px-[30px] py-10 text-center shadow-[0_14px_44px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[26px] backdrop-saturate-[170%]"
      >
        <p
          class="m-0 text-[14.5px] leading-[1.5] text-riv-card-ink-soft"
          data-testid="page-load-failed-reloading"
        >
          Loading this page again…
        </p>
      </section>
    } @else {
      <section
        appFailurePanel
        role="alert"
        class="mx-auto max-w-[460px]"
        aria-labelledby="page-load-failed-title"
        data-testid="page-load-failed"
      >
        <span appFailureIcon aria-hidden="true"><app-alert-icon /></span>
        <h1 appFailureTitle id="page-load-failed-title">Couldn’t load this page</h1>
        <p appFailureText>
          Part of Riviera didn’t arrive — the connection dropped, or the app was just updated. Try
          again, or head back to the beaches.
        </p>
        <app-retry-button testId="page-load-failed-retry" (retry)="retry()" />
        <p class="mt-5 mb-0">
          <a
            appTouchTarget
            routerLink="/"
            class="inline-flex items-center text-[14.5px] font-semibold text-riv-accent-ink underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
            data-testid="page-load-failed-home"
            >Back to the beaches</a
          >
        </p>
      </section>
    }
  `,
})
export class PageLoadFailed {
  protected readonly recovery = inject(ChunkLoadRecovery);
  private readonly focus = focusMover();

  /** The pressed button goes with the card, so focus moves to the line that replaces it. */
  protected retry(): void {
    this.recovery.retry();
    this.focus('page-load-failed-reloading');
  }
}
