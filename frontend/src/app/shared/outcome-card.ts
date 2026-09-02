import { Component, computed, input } from '@angular/core';

import { CardGlass } from './card-glass';

/** How a landed state reads: a finished action, or one parked awaiting someone else. */
export type OutcomeTone = 'success' | 'pending';

let nextHeadingId = 0;

/**
 * The "landed" card the auth page swaps in once a flow finishes — a centred glass card
 * with a tone-coloured glyph, a heading, projected body copy and a projected CTA. Two tones today:
 * `success` (signed in) and `pending` (an operator registration awaiting admin approval).
 *
 * Reusable rather than inlined because the same shape serves three distinct landed states, and a
 * shared primitive keeps their a11y contract identical: the card is a labelled region, the glyph is
 * decorative (`aria-hidden` — the heading already carries the meaning), and the CTA is projected so
 * each caller supplies its own link or button without the card knowing about routing.
 *
 * Sits on {@link CardGlass} so it inherits the AA-proven `--riv-card-*` token set instead of a
 * private translucent fill; the composited maths lives in the consumer's `*.contrast.spec.ts`.
 * The tone glyph itself is the opposite — an opaque, theme-invariant skin; see
 * {@link OutcomeCard.glyphClasses}.
 */
@Component({
  selector: 'app-outcome-card',
  imports: [CardGlass],
  template: `
    <section
      appCardGlass
      class="rounded-[32px] px-[30px] pt-[38px] pb-[30px] text-center shadow-[0_30px_80px_rgba(6,30,40,0.42),inset_0_1px_0_rgba(255,255,255,0.9)]"
      [attr.aria-labelledby]="headingId"
      [attr.data-testid]="testId() ?? null"
    >
      <div data-riv-outcome-glyph aria-hidden="true" [class]="glyphClasses()">{{ glyph() }}</div>
      <h1
        [id]="headingId"
        class="m-0 mb-2 text-[27px] font-bold tracking-[-0.02em] text-riv-card-ink"
      >
        {{ heading() }}
      </h1>
      <p class="m-0 mb-[22px] text-[14.5px] leading-[1.5] text-riv-card-ink-soft">
        <ng-content />
      </p>
      <ng-content select="[outcomeCta]" />
    </section>
  `,
})
export class OutcomeCard {
  readonly tone = input<OutcomeTone>('success');
  readonly heading = input.required<string>();
  readonly testId = input<string>();

  /** Unique so several cards on one page keep distinct `aria-labelledby` targets. */
  protected readonly headingId = `outcome-heading-${nextHeadingId++}`;

  protected readonly glyph = computed(() => (this.tone() === 'pending' ? '⏳' : '✓'));

  /**
   * Both tones wear the `--riv-medallion-*` skin, so this glyph is the same paint as
   * `booking-confirmation`'s ✓ and `request-confirmation`'s ✉. They do NOT theme, and must not: the
   * fills are fixed, and a themed ink over a fixed fill drifts (dark `--riv-accent-ink` over the
   * positive fill is 1.41:1). Decorative (`aria-hidden`), so exempt from the AA text minimum but
   * held to 3:1 in `auth/auth-page.contrast.spec.ts`. Take the ternary whole — one branch tokenised
   * leaves a named utility beside a hex literal in one expression.
   *
   * Rationale: PR #871.
   */
  protected readonly glyphClasses = computed(
    () =>
      'mx-auto mb-[18px] flex h-[66px] w-[66px] items-center justify-center rounded-full border border-[rgba(255,255,255,0.6)] text-[30px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ' +
      (this.tone() === 'pending'
        ? 'bg-riv-medallion-waiting-fill text-riv-medallion-waiting-ink'
        : 'bg-riv-medallion-positive-fill text-riv-medallion-positive-ink'),
  );
}
