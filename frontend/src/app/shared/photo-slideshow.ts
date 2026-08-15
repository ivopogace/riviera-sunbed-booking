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
        <span
          class="absolute right-[15px] bottom-[13px] z-[1] flex gap-[6px]"
          [attr.data-testid]="testId() + '-dots'"
        >
          @for (photo of photos(); track $index; let i = $index) {
            <span
              class="size-[6px] rounded-full [transition:background_0.15s_ease]"
              [class]="i === index() ? 'bg-white' : 'bg-white/45'"
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
          class="inline-flex size-[30px] items-center justify-center rounded-full border border-(--riv-card-border) bg-(--riv-mode-chip-glass) pb-[2px] text-[18px] leading-none text-(--riv-accent-ink) backdrop-blur-[10px] [transition:background_0.15s_ease] group-hover:bg-white"
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
          class="inline-flex size-[30px] items-center justify-center rounded-full border border-(--riv-card-border) bg-(--riv-mode-chip-glass) pb-[2px] text-[18px] leading-none text-(--riv-accent-ink) backdrop-blur-[10px] [transition:background_0.15s_ease] group-hover:bg-white"
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

  /**
   * The photo currently shown (0-based). Linked to `photos` so a changed input (the host
   * survived a reload — e.g. the beach map's date change) resets to the first slide instead of
   * pointing past a shrunken list and blanking the band.
   */
  protected readonly index = linkedSignal({
    source: this.photos,
    computation: () => 0,
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
