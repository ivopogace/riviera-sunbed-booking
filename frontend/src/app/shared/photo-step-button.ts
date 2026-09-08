import { Component, input, output } from '@angular/core';

import { TouchTarget } from './touch-target';

/** Which way the control steps — picks the side it pins to and the chevron it wears. */
export type StepDirection = 'prev' | 'next';

/**
 * One prev/next step control for a photo slideshow: a 44 px transparent hit box pinned to the
 * band's left or right edge, painting a 30 px glass chevron chip inside it. The chip's alphas are
 * proven at 3:1 over any photo in `photo-slideshow.contrast.spec.ts`.
 *
 * <p>Hosts on `class: 'contents'` so the wrapper leaves no box and the consumer's positioned band
 * lays out the `<button>` itself. `pointer-events-auto` is unconditional because the Discover card
 * parks its pair inside a `pointer-events-none` overlay — keeping the card link clickable between
 * them — and a `display: contents` host has no box to carry the re-enable.
 *
 * <p>The chip is `aria-hidden`; {@link label} is the whole accessible name, since "›" is not one.
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
