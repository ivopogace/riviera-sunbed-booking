import { Component, computed, input } from '@angular/core';

/**
 * The one announcement a loading surface makes to assistive tech, as a region that **outlives the
 * transition it announces**.
 *
 * <p>A live region generally announces only content that MUTATES after the region is already in the
 * DOM. A container that enters the DOM already holding its "Loading…" line and is removed wholesale
 * when the content lands does the opposite, so the line reads as silence — and a spec that asserts
 * the text passes either way.
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
 * <p>`ready` is the call site saying it reached its **loaded** branch — not merely that it stopped
 * loading. The difference is the whole reason this input has the polarity it does. The alternative,
 * a `failed` flag, is fail-OPEN: it makes silence conditional on remembering every non-success
 * exit — a 404, a partial read, a signed-out visitor — and any exit nobody thought to bind
 * announces "…loaded." over a panel saying the opposite. `ready` inverts that: an exit nobody
 * described is silent, and silence is the recoverable failure; a lie is not.
 *
 * <p>Announcing the failure **itself** is deliberately not this component's job. That belongs to
 * the call site's failure branch, as `role="alert"` — announced on insertion, the one live-region
 * case with good support. This component's contract on that side is only that it must never
 * *contradict* such a panel, which is what `ready` buys. Check the branch rather than assume it:
 * a `role="status"` panel born holding its text announces nothing, and so does no role at all.
 *
 * <p>`loading` wins over `ready` if a call site somehow asserts both: in flight is the safer read of
 * a contradiction.
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

  /**
   * True only in the surface's **loaded** branch. Anything else — a failure, a 404, a signed-out
   * visitor — leaves it false and this region silent. See the class note on why it is not `failed`.
   */
  readonly ready = input(false);

  /** Spoken while loading, and on every re-load once the region is mounted. */
  readonly loadingLabel = input.required<string>();

  /** Spoken when the content lands. Empty where another persistent region already says it. */
  readonly readyLabel = input('');

  protected readonly message = computed(() => {
    if (this.loading()) {
      return this.loadingLabel();
    }
    return this.ready() ? this.readyLabel() : '';
  });
}
