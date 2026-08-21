import { Component, computed, input } from '@angular/core';

/**
 * The one announcement a loading surface makes to assistive tech, as a region that **outlives the
 * transition it announces**.
 *
 * <p>A live region generally announces only content that MUTATES after the region is already in the
 * DOM. Every loading surface here used to do the opposite — a container that entered the DOM
 * holding its "Loading…" line and was removed wholesale when the content landed — so the line read
 * as silence while the specs asserting its text stayed green (#741, the deferred F-4 of #740).
 * angular.dev says the same thing about `@defer`: screen readers "may not announce changes when the
 * deferred content loads", and the fix is a live region that wraps the transition. Its example puts
 * the region around the content with `aria-atomic`; that shape suits a small profile card, not a
 * venue grid, so this takes the sibling form `booking/booking-pay.ts`'s `pay-status` region already
 * uses: one persistent `sr-only` paragraph, mounted OUTSIDE the caller's loading branch, whose text
 * is all that changes.
 *
 * <p>**Mount it outside the `@if`.** Inside, it is the very bug it exists to fix, and nothing in
 * jsdom would tell you — which is why each adopting surface's spec asserts element identity across
 * the transition rather than the presence of text.
 *
 * <p>`failed` exists because "not loading" is not "loaded": four of the eight surfaces can leave the
 * loading state by failing, and a region that says "Payouts loaded." over a failure panel is worse
 * than silence. Announcing the failure itself is deliberately NOT this component's job — no failure
 * panel in the app is a live region yet, and that is one defect, fixed in one place, not here.
 *
 * <p>`readyLabel` is a static sentence, never a live count: a count re-announces on every later
 * mutation (a date change, an accepted request), and the surfaces that have a count already have a
 * region speaking it. Discover leaves `readyLabel` empty for exactly that reason — its results-count
 * region sits above the `@if` chain and already announces the outcome. One source per sentence.
 *
 * <p>What this does not claim: that the FIRST "Loading…" is spoken. A surface mounts already
 * loading, so that text is present at insertion like before. Re-loads (a filter change, a retry)
 * do announce it, and the loading→loaded transition — the half that tells a user the wait is over —
 * announces in every case.
 *
 * <p>Host is `display: contents` and the paragraph is `sr-only` (absolutely positioned), so mounting
 * it costs no layout: it becomes neither a flex item nor a grid item wherever a call site puts it.
 */
@Component({
  selector: 'app-load-announcer',
  host: { class: 'contents' },
  template: `<p class="sr-only" role="status" aria-live="polite" data-testid="load-announcer">
    {{ message() }}
  </p>`,
})
export class LoadAnnouncer {
  /** True while the surface's content is in flight. */
  readonly loading = input.required<boolean>();

  /** True when the load ended in failure — suppresses {@link readyLabel}, announcing nothing. */
  readonly failed = input(false);

  /** Spoken while loading, and on every re-load once the region is mounted. */
  readonly loadingLabel = input.required<string>();

  /** Spoken when the content lands. Empty where another persistent region already says it. */
  readonly readyLabel = input('');

  protected readonly message = computed(() =>
    this.loading() ? this.loadingLabel() : this.failed() ? '' : this.readyLabel(),
  );
}
