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
 * The tone glyph itself is the opposite — an opaque, theme-invariant skin that owes the card
 * nothing; see {@link OutcomeCard.glyphClasses}.
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
   * The circle is decorative (`aria-hidden`), so WCAG 1.4.3 exempts it from the AA *text* minimum —
   * it is still held to 1.4.11's 3:1 in `auth/auth-page.contrast.spec.ts`, which is what caught the
   * pre-#869 `pending` tone at 2.46:1 in dark.
   *
   * <p>Both tones wear the `--riv-medallion-*` skin (#858), so this card's glyph is the same paint
   * as `booking-confirmation`'s ✓ and `request-confirmation`'s ✉ rather than a third recipe. They
   * therefore **do not theme**, and that is the point rather than an oversight: the fills are fixed,
   * and #858's argument is that an ink over a fixed fill must not theme (dark `--riv-accent-ink`
   * over the positive fill measures 1.41:1). Note what convergence cost — the `success` tone used
   * to theme *correctly*, because `--riv-accent-chip-fill` is a translucent tint that resolved
   * against the themed card. That was the app's only theming medallion, and #869 traded it for one
   * medallion vocabulary; the reasoning is at the token declaration in `tailwind.css`.
   *
   * <p>The ternary moves whole. Tokenising one branch would leave a named utility beside a hex
   * literal in one expression — the mis-cut #858 was itself re-cut to undo.
   */
  protected readonly glyphClasses = computed(
    () =>
      'mx-auto mb-[18px] flex h-[66px] w-[66px] items-center justify-center rounded-full border border-[rgba(255,255,255,0.6)] text-[30px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ' +
      (this.tone() === 'pending'
        ? 'bg-riv-medallion-waiting-fill text-riv-medallion-waiting-ink'
        : 'bg-riv-medallion-positive-fill text-riv-medallion-positive-ink'),
  );
}
