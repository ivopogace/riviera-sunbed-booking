import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChunkLoadRecovery } from '../../core/chunk-load-recovery';
import { AlertIcon } from '../../shared/alert-icon';
import { FAILURE_DIRECTIVES } from '../../shared/failure-panel';
import { RetryButton } from '../../shared/retry-button';
import { TouchTarget } from '../../shared/touch-target';

/**
 * The answer to a lazy route whose chunk failed to load (#1543), rendered in the outlet under the
 * target's own URL by `core/chunk-load-recovery.ts`. Neutral while the one automatic reload is in
 * flight; otherwise the shared failure panel with "Try again" (a fresh load of the target) and the
 * way back to the beaches. Eager in `app.routes.ts`: this page must never need a chunk itself.
 */
@Component({
  selector: 'app-page-load-failed',
  imports: [RouterLink, AlertIcon, RetryButton, TouchTarget, ...FAILURE_DIRECTIVES],
  template: `
    @if (recovery.reloading()) {
      <p
        class="mx-auto my-8 max-w-[460px] text-center text-[14.5px] text-riv-ink-soft"
        data-testid="page-load-failed-reloading"
      >
        Loading this page again…
      </p>
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
        <app-retry-button testId="page-load-failed-retry" (retry)="recovery.retry()" />
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
}
