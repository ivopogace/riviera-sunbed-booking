import { Component, input, output } from '@angular/core';

/**
 * The recover-and-reload banner for a `409 STALE_WRITE` optimistic-concurrency loss, shared
 * across the venue, layout and pricing tabs. The <em>banner</em> is shared; the per-surface
 * recovery semantics are not — the layout editor keeps
 * the painted grid, the pricing tab reverts the row — so consumers project their own message,
 * react to {@link reload}, and keep their own state. The host element IS the amber alert surface
 * (`role="alert"` + the container classes), so a consumer's `data-testid` and margin utility land
 * on the banner itself and existing spec hooks keep working. An optional `[bannerFooter]` slot
 * after the button hosts surface-specific follow-ups (the layout editor's reload-failed hint);
 * conditional footer content reaches it via `ngProjectAs="[bannerFooter]"` on an `ng-container`,
 * the documented alias for projecting `@if`-guarded content into a named slot.
 */
@Component({
  selector: 'app-stale-write-banner',
  host: {
    role: 'alert',
    class:
      'flex flex-col gap-2 rounded-[14px] border border-[#d97706] bg-[#f59e0b]/[0.14] px-3.5 py-3',
  },
  template: `
    <span class="text-[12.5px] leading-[1.5] font-semibold text-(--riv-card-ink)">
      <ng-content />
    </span>
    <button
      type="button"
      class="self-start rounded-[12px] border border-(--riv-card-border) bg-white/70 px-4 py-2 text-[13px] font-bold text-(--riv-card-ink) [transition:background_0.15s_ease] hover:bg-white/90 disabled:opacity-50"
      [attr.data-testid]="reloadTestId()"
      [disabled]="reloading()"
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
