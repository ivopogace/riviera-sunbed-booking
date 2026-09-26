import { NgOptimizedImage } from '@angular/common';
import { booleanAttribute, Component, computed, input, linkedSignal } from '@angular/core';

import { photoSrcset } from './photo-url';
import { PhotoStepButton } from './photo-step-button';
import { TouchTarget } from './touch-target';
import { PhotoView } from './venue-views';

/**
 * How far a finger must travel horizontally before it counts as a step rather than a tap. 40 px is
 * wide enough that the tap which opens the lightbox (or follows the Discover card's link) still
 * reads as a tap on a shaky hand, and short enough to feel like a flick on a 150 px band.
 */
const SWIPE_THRESHOLD_PX = 40;

/**
 * Wrapping crossfade slideshow (dots, prev/next, arrows, swipe) filling its positioned ancestor.
 * `ownControls` adds step buttons, an APG dot picker and a position live region — never inside a
 * link or `aria-hidden` tree; otherwise the host drives {@link prev}/{@link next} and announces
 * {@link positionLabel} itself. Only reached slides mount: lazy loading can't skip an `opacity-0`
 * slide. Chrome has its own 3:1 backing; the active dot is a wider pill (shape is the state cue).
 * Picker: 44 px dots, 18 px pill, 13 px rail inset; it follows the step buttons so it wins overlaps.
 */
@Component({
  selector: 'app-photo-slideshow',
  imports: [NgOptimizedImage, PhotoStepButton, TouchTarget],
  host: {
    // touch-pan-y: the browser keeps vertical scrolling, we keep the horizontal gesture.
    class: 'absolute inset-0 block touch-pan-y',
    '(keydown.arrowleft)': 'onArrow($event, -1)',
    '(keydown.arrowright)': 'onArrow($event, 1)',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onSwipeAbandoned()',
    '(click)': 'onClick($event)',
  },
  template: `
    <span class="absolute inset-0 block" aria-hidden="true">
      <!-- track $index, not the URL: content-addressed URLs collide when one image fills two slots. -->
      @for (photo of photos(); track $index; let i = $index) {
        @if (mounted().has(i)) {
          <img
            [ngSrc]="photo.url"
            [attr.srcset]="srcsetOf(photo)"
            disableOptimizedSrcset
            [sizes]="sizes()"
            fill
            [priority]="priority() && i === 0"
            class="[transition:opacity_0.45s_ease] motion-reduce:transition-none"
            [class.object-contain]="contain()"
            [class.object-cover]="!contain()"
            [class.opacity-0]="i !== index()"
            alt=""
            [attr.data-testid]="i === 0 ? testId() + '-img' : testId() + '-slide-img'"
            (load)="onSlideLoaded(i)"
          />
        }
      }
    </span>
    @if (photos().length > 1) {
      @if (ownControls()) {
        <app-photo-step-button
          direction="prev"
          [testId]="testId() + '-prev'"
          [label]="'Previous photo, ' + name()"
          (stepped)="prev()"
        />
        <app-photo-step-button
          direction="next"
          [testId]="testId() + '-next'"
          [label]="'Next photo, ' + name()"
          (stepped)="next()"
        />
        <!-- The APG carousel's slide picker; its geometry is in the class doc. -->
        <div
          class="absolute right-[7px] bottom-0 z-10 flex items-center"
          [attr.data-testid]="testId() + '-dots'"
        >
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-[6px] inset-y-[13px] rounded-full bg-riv-photo-chrome"
          ></span>
          @for (photo of photos(); track $index; let i = $index) {
            <button
              type="button"
              appTouchTarget
              class="relative inline-flex size-11 cursor-pointer touch-manipulation items-center justify-center rounded-full focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-white"
              [attr.data-testid]="testId() + '-dot-' + i"
              [attr.aria-label]="slideLabel(i)"
              [attr.aria-current]="i === index() ? 'true' : null"
              (click)="goTo(i)"
            >
              <span
                aria-hidden="true"
                class="h-[8px] rounded-full [transition:background_0.15s_ease,width_0.15s_ease] motion-reduce:transition-none"
                [class]="i === index() ? 'w-[18px] bg-white' : 'w-[8px] bg-white/65'"
              ></span>
            </button>
          }
        </div>
        <!-- Rationale: shared/load-announcer.ts. -->
        <output class="sr-only" aria-live="polite" [attr.data-testid]="testId() + '-position'">
          {{ positionLabel() }}
        </output>
      } @else {
        <!-- Inert indicator, not a picker: this placement lives inside the Discover card's <a>. -->
        <span
          class="absolute right-[13px] bottom-[11px] z-[1] flex items-center gap-[7px] rounded-full bg-riv-photo-chrome px-[7px] py-[5px]"
          aria-hidden="true"
          [attr.data-testid]="testId() + '-dots'"
        >
          @for (photo of photos(); track $index; let i = $index) {
            <span
              class="h-[8px] rounded-full [transition:background_0.15s_ease,width_0.15s_ease] motion-reduce:transition-none"
              [class]="i === index() ? 'w-[18px] bg-white' : 'w-[8px] bg-white/65'"
            ></span>
          }
        </span>
      }
    }
  `,
})
export class PhotoSlideshow {
  readonly photos = input.required<readonly PhotoView[]>();
  /** The subject named in the step controls' accessible labels. */
  readonly name = input('');
  /** Prefix for the slide/dots/controls test hooks. */
  readonly testId = input('photo');
  /** Render the component's own step buttons — only for hosts NOT inside a link/aria-hidden tree. */
  readonly ownControls = input(false, { transform: booleanAttribute });

  /**
   * The `srcset` fallback `sizes`; unset means `100vw`, which fetches the widest candidate, so a
   * narrower host passes its own (letterboxing hosts: `CONTAIN_SIZES` in `shared/photo-url.ts`).
   * Constant per instance: `NgOptimizedImage` throws on a post-init change.
   */
  readonly sizes = input<string>();

  /** Letterbox instead of crop — the lightbox's roomier, closer-to-square box can afford to
   *  show a portrait photo whole; the header/card bands stay cropped (the default). */
  readonly contain = input(false, { transform: booleanAttribute });

  /**
   * Mark the first slide as the page's LCP image (`fetchpriority=high`, preload) — at most one per
   * page, so only the beach-map banner sets it, never a grid of cards or the lightbox.
   * Constant per instance: `NgOptimizedImage` throws on a post-init change.
   */
  readonly priority = input(false, { transform: booleanAttribute });

  /** The slide shown on mount (0-based) — the lightbox opens on whichever photo was tapped;
   *  every other host leaves this at the default first slide. */
  readonly startIndex = input(0);

  /**
   * Reset key for the signals below: the content-addressed baseline URLs, not array identity —
   * hosts rebuild the array in a `computed()`, which would snap every card back to slide 1.
   */
  private readonly photosKey = computed(() =>
    this.photos()
      .map((photo) => photo.url)
      .join('\n'),
  );

  /**
   * The photo currently shown (0-based). Linked to {@link photosKey} so a genuinely changed list
   * (the host survived a reload — e.g. the beach map's date change, or photos deleted) resets to
   * {@link startIndex} instead of pointing past a shrunken list and blanking the band.
   */
  readonly index = linkedSignal({
    source: this.photosKey,
    computation: () => this.startIndex(),
  });

  /** Which slides have an `<img>` in the DOM — see the class doc's note on request count. */
  protected readonly mounted = linkedSignal<string, ReadonlySet<number>>({
    source: this.photosKey,
    computation: () => new Set([this.startIndex()]),
  });

  /** Whether the tourist has stepped at all; until then, neighbours are not worth prefetching. */
  private readonly stepped = linkedSignal<string, boolean>({
    source: this.photosKey,
    computation: () => false,
  });

  /** "Photo 2 of 3" — the live-region sentence, also read by the external-controls host. */
  readonly positionLabel = computed(() =>
    this.photos().length > 1 ? `Photo ${this.index() + 1} of ${this.photos().length}` : '',
  );

  /** Origin and pointer of the gesture in flight, or `undefined` when none is. */
  private swipeFrom: { readonly x: number; readonly y: number; readonly id: number } | undefined;
  /** A swipe just stepped, so the click the browser synthesises from it must not reach the host. */
  private swipeConsumedClick = false;

  /** Step forward, wrapping past the last photo. */
  next(): void {
    this.step(1);
  }

  /** Step back, wrapping before the first photo. */
  prev(): void {
    this.step(-1);
  }

  /** Jump straight to a slide — the dot picker, and anything else that knows where it wants to go. */
  goTo(target: number): void {
    if (target === this.index() || target < 0 || target >= this.photos().length) {
      return;
    }
    this.stepped.set(true);
    this.mounted.update((shown) => new Set(shown).add(target));
    this.index.set(target);
  }

  /** `null` rather than a one-entry attribute — with a single candidate, `src` already says it. */
  protected srcsetOf(photo: PhotoView): string | null {
    return photoSrcset(photo);
  }

  protected slideLabel(i: number): string {
    const subject = this.name() ? `, ${this.name()}` : '';
    return `Photo ${i + 1} of ${this.photos().length}${subject}`;
  }

  /**
   * Warm the neighbours of the slide that just painted, so the NEXT crossfade has bytes to fade to.
   * Gated on the tourist having stepped once — that is what separates a Discover grid nobody has
   * touched (one image per card) from a venue whose photos are actually being browsed.
   */
  protected onSlideLoaded(i: number): void {
    const count = this.photos().length;
    if (!this.stepped() || i !== this.index() || count < 2) {
      return;
    }
    this.mounted.update((shown) =>
      new Set(shown).add((i + 1) % count).add((i - 1 + count) % count),
    );
  }

  /**
   * ArrowLeft/ArrowRight step the band whenever focus is inside it (WCAG 2.1.1). `stopPropagation`
   * is load-bearing: {@link PhotoLightbox} binds the same keys on an ancestor, so without it one
   * keypress on our buttons would step twice.
   */
  protected onArrow(event: Event, delta: 1 | -1): void {
    if (this.photos().length < 2) {
      return;
    }
    event.stopPropagation();
    // Otherwise the arrow also scrolls the page under the lightbox / the venue header.
    event.preventDefault();
    this.step(delta);
  }

  /**
   * Begin a gesture. `isPrimary` only breaks a tie with a gesture in flight (a second finger drops
   * it); any other press starts fresh, so a lost `pointerup` or an unpopulated `isPrimary` never
   * blocks the next swipe.
   */
  protected onPointerDown(event: PointerEvent): void {
    this.swipeConsumedClick = false;
    if (this.swipeFrom && event.isPrimary === false) {
      this.swipeFrom = undefined;
      return;
    }
    // Touch and pen only — on Discover the band IS the card's link.
    this.swipeFrom =
      event.pointerType === 'mouse' || this.photos().length < 2
        ? undefined
        : { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  protected onPointerUp(event: PointerEvent): void {
    const from = this.swipeFrom;
    if (from?.id !== event.pointerId) {
      return;
    }
    this.swipeFrom = undefined;
    const dx = event.clientX - from.x;
    // A mostly-vertical drag is the tourist scrolling the page past the band, not stepping it.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(event.clientY - from.y)) {
      return;
    }
    this.swipeConsumedClick = true;
    this.step(dx < 0 ? 1 : -1);
  }

  protected onSwipeAbandoned(): void {
    this.swipeFrom = undefined;
  }

  /**
   * Swallow the click a completed swipe synthesises. Without this, swiping the Discover card's band
   * steps the photo AND follows the card's `routerLink`; `stopPropagation` is what keeps it off the
   * `<a>`, since `RouterLink` listens on the anchor itself.
   */
  protected onClick(event: Event): void {
    if (!this.swipeConsumedClick) {
      return;
    }
    this.swipeConsumedClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  private step(delta: 1 | -1): void {
    const count = this.photos().length;
    if (count < 2) {
      return;
    }
    this.goTo((this.index() + delta + count) % count);
  }
}
