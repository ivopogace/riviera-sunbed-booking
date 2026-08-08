import { Directive, computed, input } from '@angular/core';

/** The pill geometry every status shares (was the `.chip` block of the retired SCSS mixin). */
const BASE =
  'inline-flex items-center shrink-0 text-[12px] font-bold tracking-[0.01em] rounded-full px-3 py-[5px] whitespace-nowrap border';

/** Ink / fill / border per status modifier, keyed by {@link STATUS_META}'s `chip` value. */
const FILLS: Record<string, string> = {
  'chip--confirmed': 'text-[#0e6e46] bg-[#d9f2e7] border-[#bfe6d4]',
  'chip--pending': 'text-[#8a5410] bg-[#fceed5] border-[#f2dcae]',
  'chip--awaiting': 'text-[#0a5e7a] bg-[#d5f1f6] border-[#b6e3ec]',
  'chip--declined': 'text-[#8a3a2a] bg-[#f6e5e0] border-[#ecccc2]',
  'chip--expired': 'text-[#5a6a72] bg-[#eceeef] border-[#d7dbdd]',
  'chip--cancelled': 'text-[#8a3a2a] bg-[#f6e5e0] border-[#ecccc2]',
  'chip--completed': 'text-[#0a5e6e] bg-[#e1f5f9] border-[#c4e9ef]',
  'chip--no-show': 'text-[#7a4a3a] bg-[#ece6e3] border-[#dcd2cd]',
  'chip--withdrawn': 'text-[#5c5470] bg-[#eeecf4] border-[#dcd8e6]',
};

/**
 * The booking-status pill, shared by the booking detail view and the "My bookings" list.
 * Tailwind twin of the retired `shared/_glass.scss` `status-chip` mixin — the last
 * recipe that file carried. A directive, not a mixin: Tailwind has no CSS-level
 * sharing primitive, so a recipe applied to arbitrary hosts moves to the directive layer (the
 * `shared/amenity-chip.ts` precedent).
 *
 * <p>Takes the CSS **modifier** from {@link STATUS_META} (`chip--confirmed`), not the raw status,
 * so both consumers keep the `metaFor`-derived view-model they already build — including its
 * tolerance of an unknown status, which resolves to the neutral `chip--expired` fill.
 *
 * <p>Fills are OPAQUE SOLID, never rgba — the css:S7924 treatment: a solid fill lets both the WCAG
 * maths and the static analyzer compute small-text contrast correctly, and keeps it
 * theme-independent. Every ink/fill pair is proven AA in `shared/booking-status.contrast.spec.ts`,
 * still the one home of that proof. `metaFor`'s fallback modifier (`chip--expired`) guarantees a
 * hit in {@link FILLS} for a status this build doesn't know, so FE/BE skew still renders a chip.
 *
 * <p>The marker classes `chip` and `chip--*` are emitted by the directive rather than left on the
 * consuming template, so the vocabulary and the styling it selects cannot drift apart and no
 * consumer can forget them. Note they are **not** load-bearing for any existing test — unlike
 * `amenity-chip`'s markers, nothing queries `.chip` in the DOM (both e2e suites select
 * the chip by `data-testid`, and `booking-status.spec.ts` asserts the modifier as *data* out of
 * {@link STATUS_META}, not as a rendered class). They are kept because that `STATUS_META` vocabulary
 * is what the modifier means, so rendering it keeps the DOM and the vocabulary in agreement — and
 * `status-chip.spec.ts` now pins them, which is what makes them a real hook rather than a claimed one.
 *
 * <p>Not for the reason the sibling directives used to give: in Angular 22 a static `class` on the
 * element and a host `[class]` binding **merge**, they do not replace one another (pinned below by
 * `status-chip.spec.ts`, which is why the claim is stated here rather than trusted). The choice is
 * about ownership, not about avoiding a clobber.
 */
@Directive({
  selector: '[appStatusChip]',
  host: { '[class]': 'classes()' },
})
export class StatusChip {
  /** The status's CSS modifier, e.g. `chip--confirmed` (`STATUS_META[status].chip`). */
  readonly appStatusChip = input.required<string>();

  protected readonly classes = computed(() => {
    const modifier = this.appStatusChip();
    return `chip ${modifier} ${BASE} ${FILLS[modifier] ?? FILLS['chip--expired']}`;
  });
}
