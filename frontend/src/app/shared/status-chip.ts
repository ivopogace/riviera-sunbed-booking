import { Directive, computed, input } from '@angular/core';

/** The pill geometry every status shares (was the `.chip` block of the retired SCSS mixin). */
const BASE =
  'inline-flex items-center shrink-0 text-[12px] font-bold tracking-[0.01em] rounded-full px-3 py-[5px] whitespace-nowrap border';

/**
 * Ink / fill / border per status modifier — the design's translucent status tints composited over
 * white. Keyed by the `chip` modifier in {@link STATUS_META}, whose fallback (`chip--expired`)
 * guarantees a hit for a status this build doesn't know.
 */
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
 * The booking-status pill, shared by the booking detail view (#138) and the "My bookings" list
 * (#139). Tailwind twin of the `shared/_glass.scss` `status-chip` mixin, ported at #477 — the last
 * recipe in that file, which retires with it. A directive, not a mixin: Tailwind has no CSS-level
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
 * still the one home of that proof.
 *
 * <p>The host owns its whole class list via one `[class]` computed — a static `class` on the
 * consuming element would be REPLACED by this binding. That is why the literal marker classes
 * `chip` and `chip--*` are emitted here: they are retained as inert test hooks (the unit specs and
 * both e2e suites query them), while the utilities do the styling.
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
