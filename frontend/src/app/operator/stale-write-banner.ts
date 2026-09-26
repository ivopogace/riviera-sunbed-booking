import { Component, input, output } from '@angular/core';

import { BusyAction } from '../shared/busy-action';

import { TouchTarget } from '../shared/touch-target';

/**
 * The recover-and-reload banner for a `409 STALE_WRITE` loss, shared by the venue, layout and
 * pricing tabs. Recovery is per-surface: consumers project their message, react to {@link reload}
 * and keep their own state. The host IS the `role="alert"` surface, so a consumer's `data-testid`
 * and margin land on the banner. An optional `[bannerFooter]` slot follows the button;
 * `@if`-guarded content reaches it only via `ngProjectAs="[bannerFooter]"` on an `ng-container`.
 */
@Component({
  selector: 'app-stale-write-banner',
  imports: [BusyAction, TouchTarget],
  host: {
    role: 'alert',
    class:
      'flex flex-col gap-2 rounded-[14px] border border-riv-warn-edge bg-riv-warn-edge/15 px-3.5 py-3',
  },
  template: `
    <span class="text-[12.5px] leading-[1.5] font-semibold text-riv-card-ink">
      <ng-content />
    </span>
    <button
      appTouchTarget
      type="button"
      class="self-start rounded-[12px] border border-riv-card-border bg-riv-console-inset/70 px-4 py-2 text-[13px] font-bold text-riv-card-ink [transition:background_0.15s_ease] hover:bg-riv-console-inset/90 aria-disabled:opacity-50"
      [attr.data-testid]="reloadTestId()"
      [appBusy]="reloading()"
      (click)="reload.emit()"
    >
      {{ reloading() ? 'Reloading…' : 'Reload latest' }}
    </button>
    <ng-content select="[bannerFooter]" />
  `,
})
export class StaleWriteBanner {
  /** The `data-testid` for the Reload button — each surface keeps its own spec hook. */
  readonly reloadTestId = input.required<string>();
  /** True while the consumer's reload is in flight — disables the button, shows "Reloading…". */
  readonly reloading = input(false);
  /** Emitted when the operator clicks Reload; the consumer owns the actual recovery. */
  readonly reload = output<void>();
}
