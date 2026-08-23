import { NgOptimizedImage } from '@angular/common';
import { booleanAttribute, Component, input, linkedSignal } from '@angular/core';

import { TouchTarget } from './touch-target';

/**
 * A crossfading photo slideshow: an absolutely-filled slide stack with dot indicators and
 * prev/next stepping, wrapping at either end. The host fills its nearest positioned ancestor
 * (`absolute inset-0`), so consumers drop it into any photo band; with no photos it renders
 * nothing and the band's own background shows through.
 *
 * Controls come in two placements, because a control nested inside a link is invalid HTML and
 * an axe failure:
 * - `ownControls` (the beach-map banner): the component renders its own labelled step buttons.
 *   The images/dots layer is `aria-hidden`; the buttons are not, so never place this mode
 *   inside a link or an `aria-hidden` subtree.
 * - external (the Discover card, whose whole card is an `<a>`): leave `ownControls` unset and
 *   drive {@link prev}/{@link next} from buttons OUTSIDE the link via a template reference.
 *
 * The chrome (dot rail, step chips) carries its OWN backing rather than leaning on a host's
 * scrim — it paints above that scrim, and an uploaded photo can be any colour; the alphas are
 * proven at 3:1 over the worst case in `photo-slideshow.contrast.spec.ts` (#704).
 *
 * `testId` prefixes the test hooks: `{testId}-img` (first slide), `{testId}-slide-img` (rest),
 * `{testId}-dots`, and — with own controls — `{testId}-prev` / `{testId}-next`. `name` gives the
 * control labels their subject ("Next photo, Miramar Beach Club").
 */
@Component({
  selector: 'app-photo-slideshow',
  imports: [NgOptimizedImage, TouchTarget],
  host: { class: 'absolute inset-0 block' },
  template: `
    <span class="absolute inset-0 block" aria-hidden="true">
      <!-- track $index, not the URL: content-addressed URLs collide when one image fills two slots. -->
      @for (photo of photos(); track $index; let i = $index) {
        <img
          [ngSrc]="photo"
          fill
          class="object-cover [transition:opacity_0.45s_ease] motion-reduce:transition-none"
          [class.opacity-0]="i !== index()"
          alt=""
          [attr.data-testid]="i === 0 ? testId() + '-img' : testId() + '-slide-img'"
        />
      }
      @if (photos().length > 1) {
        <!-- The rail is the dots' backing, not decoration: they paint ABOVE the host's scrim, so over a pale photo a bare white dot is invisible (#704). Proven at 3:1 in photo-slideshow.contrast.spec.ts. -->
        <span
          class="absolute right-[13px] bottom-[11px] z-[1] flex items-center gap-[7px] rounded-full bg-(--riv-photo-chrome) px-[7px] py-[5px]"
          [attr.data-testid]="testId() + '-dots'"
        >
          @for (photo of photos(); track $index; let i = $index) {
            <span
              class="size-[8px] rounded-full [transition:background_0.15s_ease]"
              [class]="i === index() ? 'bg-white' : 'bg-white/65'"
            ></span>
          }
        </span>
      }
    </span>
    @if (ownControls() && photos().length > 1) {
      <button
        type="button"
        appTouchTarget
        class="group absolute top-1/2 left-[6px] z-10 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white"
        [attr.data-testid]="testId() + '-prev'"
        [attr.aria-label]="'Previous photo, ' + name()"
        (click)="prev()"
      >
        <span
          aria-hidden="true"
          class="inline-flex size-[30px] items-center justify-center rounded-full border border-(--riv-photo-chrome-edge) bg-(--riv-mode-chip-glass) pb-[2px] text-[18px] leading-none text-(--riv-accent-ink) backdrop-blur-[10px] [transition:background_0.15s_ease] group-hover:bg-white"
          >‹</span
        >
      </button>
      <button
        type="button"
        appTouchTarget
        class="group absolute top-1/2 right-[6px] z-10 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white"
        [attr.data-testid]="testId() + '-next'"
        [attr.aria-label]="'Next photo, ' + name()"
        (click)="next()"
      >
        <span
          aria-hidden="true"
          class="inline-flex size-[30px] items-center justify-center rounded-full border border-(--riv-photo-chrome-edge) bg-(--riv-mode-chip-glass) pb-[2px] text-[18px] leading-none text-(--riv-accent-ink) backdrop-blur-[10px] [transition:background_0.15s_ease] group-hover:bg-white"
          >›</span
        >
      </button>
    }
  `,
})
export class PhotoSlideshow {
  readonly photos = input.required<readonly string[]>();
  /** The subject named in the step controls' accessible labels. */
  readonly name = input('');
  /** Prefix for the slide/dots/controls test hooks. */
  readonly testId = input('photo');
  /** Render the component's own step buttons — only for hosts NOT inside a link/aria-hidden tree. */
  readonly ownControls = input(false, { transform: booleanAttribute });

  /** The slide shown on mount (0-based) — the lightbox opens on whichever photo was tapped;
   *  every other host leaves this at the default first slide. */
  readonly startIndex = input(0);

  /**
   * The photo currently shown (0-based). Linked to `photos` so a changed input (the host
   * survived a reload — e.g. the beach map's date change) resets to the first slide instead of
   * pointing past a shrunken list and blanking the band.
   */
  protected readonly index = linkedSignal({
    source: this.photos,
    computation: () => this.startIndex(),
  });

  /** Step forward, wrapping past the last photo. */
  next(): void {
    this.step(1);
  }

  /** Step back, wrapping before the first photo. */
  prev(): void {
    this.step(-1);
  }

  private step(delta: 1 | -1): void {
    const count = this.photos().length;
    if (count < 2) {
      return;
    }
    this.index.update((i) => (i + delta + count) % count);
  }
}
