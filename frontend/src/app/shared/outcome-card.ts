import { Component, computed, input } from '@angular/core';

import { CardGlass } from './card-glass';
import { CheckIcon } from './check-icon';
import { HourglassIcon } from './hourglass-icon';

/** How a landed state reads: a finished action, or one parked awaiting someone else. */
export type OutcomeTone = 'success' | 'pending';

let nextHeadingId = 0;

/**
 * The "landed" card the auth page swaps in once a flow finishes: tone glyph, heading, projected
 * body and projected CTA (`[outcomeCta]`). Tones: `success` (signed in), `pending` (an operator
 * registration awaiting admin approval). A labelled region; the glyph is `aria-hidden` decoration.
 * Sits on {@link CardGlass} for the AA-proven `--riv-card-*` tokens (composited maths in the
 * consumer's `*.contrast.spec.ts`); the glyph is instead an opaque, theme-invariant skin — see
 * {@link OutcomeCard.glyphClasses}.
 */
@Component({
  selector: 'app-outcome-card',
  imports: [CardGlass, CheckIcon, HourglassIcon],
  template: `
    <section
      appCardGlass
      class="rounded-[32px] px-[30px] pt-[38px] pb-[30px] text-center shadow-[0_30px_80px_rgba(6,30,40,0.42),inset_0_1px_0_rgba(255,255,255,0.9)]"
      [attr.aria-labelledby]="headingId"
      [attr.data-testid]="testId() ?? null"
    >
      <div data-riv-outcome-glyph aria-hidden="true" [class]="glyphClasses()">
        @if (tone() === 'pending') {
          <app-hourglass-icon />
        } @else {
          <app-check-icon />
        }
      </div>
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

  /**
   * The fixed `--riv-medallion-*` skin; must not theme (a themed ink over a fixed fill drifts to
   * 1.41:1). Decorative, but held to 3:1 in `auth/auth-page.contrast.spec.ts`. Change the ternary
   * whole — tokenising one branch leaves a named utility beside a hex literal.
   */
  protected readonly glyphClasses = computed(
    () =>
      'mx-auto mb-[18px] flex h-[66px] w-[66px] items-center justify-center rounded-full border border-[rgba(255,255,255,0.6)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] [&_svg]:size-[28px] ' +
      (this.tone() === 'pending'
        ? 'bg-riv-medallion-waiting-fill text-riv-medallion-waiting-ink'
        : 'bg-riv-medallion-positive-fill text-riv-medallion-positive-ink'),
  );
}
