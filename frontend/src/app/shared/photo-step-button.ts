import { Component, input, output } from '@angular/core';

import { TouchTarget } from './touch-target';

/** Which way the control steps — picks the side it pins to and the chevron it wears. */
export type StepDirection = 'prev' | 'next';

/**
 * One prev/next step control for a photo slideshow: a 44 px transparent hit box pinned to the
 * band's left or right edge, painting a 30 px glass chevron chip inside it.
 *
 * <p>It exists because the recipe had four verbatim copies — both controls inside
 * {@link PhotoSlideshow} and both of the Discover card's, which live OUTSIDE the card's `<a>`
 * (a control nested in a link is invalid HTML and an axe failure, so that host drives
 * `prev()`/`next()` from a template reference instead). Four copies of a chip whose alphas are
 * proven at 3:1 in `photo-slideshow.contrast.spec.ts` is four places for that proof to drift, so
 * this is `riviera-tailwind` rule 1's "reused element is a component" branch — never `@apply`.
 *
 * <p>Hosts on `class: 'contents'` so the wrapper leaves no box: the `<button>` itself is what the
 * consumer's positioned band lays out, exactly as if the markup were still inline. That is also
 * why `pointer-events-auto` sits on the button unconditionally — the Discover card parks its pair
 * inside a `pointer-events-none` overlay so the card link stays clickable between them, and a
 * `display: contents` host has no box to carry the re-enable. Elsewhere it is a no-op.
 *
 * <p>The chip is `aria-hidden`; {@link label} is the whole accessible name ("Next photo, Miramar
 * Beach Club"), because a bare "›" is not one.
 */
@Component({
  selector: 'app-photo-step-button',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      appTouchTarget
      class="group pointer-events-auto absolute top-1/2 z-10 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white"
      [class]="direction() === 'prev' ? 'left-[6px]' : 'right-[6px]'"
      [attr.data-testid]="testId()"
      [attr.aria-label]="label()"
      (click)="stepped.emit()"
    >
      <span
        aria-hidden="true"
        class="inline-flex size-[30px] items-center justify-center rounded-full border border-riv-photo-chrome-edge bg-riv-mode-chip-glass pb-[2px] text-[18px] leading-none text-riv-accent-ink backdrop-blur-[10px] [transition:background_0.15s_ease] group-hover:bg-white"
        >{{ direction() === 'prev' ? '‹' : '›' }}</span
      >
    </button>
  `,
})
export class PhotoStepButton {
  /** Left chevron and left edge, or right chevron and right edge. */
  readonly direction = input.required<StepDirection>();
  /** The control's whole accessible name — it has no visible text. */
  readonly label = input.required<string>();
  /** The control's `data-testid`; the consumer owns the prefix. */
  readonly testId = input.required<string>();
  /** Tapped — the consumer steps its own slideshow. */
  readonly stepped = output<void>();
}
