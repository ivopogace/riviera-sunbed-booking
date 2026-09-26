import { Directive, computed, input } from '@angular/core';

/** The pill geometry every status shares. */
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
 * The booking-status pill (booking detail, "My bookings"). Takes the CSS modifier from
 * {@link STATUS_META} (`chip--confirmed`), not the raw status; `metaFor` maps an unknown status to
 * `chip--expired`, so FE/BE skew still renders. Fills are OPAQUE SOLID, never rgba — the css:S7924
 * treatment: contrast stays computable and theme-independent, each pair proven AA in
 * `shared/booking-status.contrast.spec.ts`. It emits the `chip`/`chip--*` markers so vocabulary and
 * styling can't drift; they merge with a static `class` (both pinned by `status-chip.spec.ts`).
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
