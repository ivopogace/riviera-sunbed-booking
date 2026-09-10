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
 * A crossfading photo slideshow: a filled slide stack with a dot rail, prev/next stepping, arrow
 * keys and touch swipe, wrapping at either end. The host fills its nearest positioned ancestor, so
 * consumers drop it into any photo band; with no photos it renders nothing.
 *
 * <p>Two control placements, because a control nested inside a link is invalid HTML and an axe
 * failure. With `ownControls` (the beach-map banner, the lightbox) it renders its own step buttons,
 * its dot rail as an APG slide picker, and the live region announcing the position — so never place
 * that mode inside a link or an `aria-hidden` subtree. Without it (the Discover card, whose whole
 * card is an `<a>`) the dots stay inert `<span>`s, the host drives {@link prev}/{@link next} from
 * buttons outside the link, and the host mounts {@link positionLabel} in its own live region.
 *
 * <p>Only slides the tourist has reached are in the DOM: an `opacity-0` slide stacked over the
 * visible one still intersects the viewport, so `NgOptimizedImage`'s lazy loading would not spare
 * one byte. Neighbours are warmed from the current slide's `load`, and only once stepping has
 * begun, which is what holds an idle Discover grid to one request per card. The first step
 * therefore crossfades to an image still arriving.
 *
 * <p>The chrome carries its OWN backing rather than a host's scrim: it paints above that scrim and
 * an uploaded photo can be any colour. Alphas proven at 3:1 in `photo-slideshow.contrast.spec.ts`.
 * The current slide is marked by a wider PILL, not a brighter dot — the inactive dot must clear 3:1
 * against its rail and the active one against the inactive, and two such steps do not fit between
 * the rail and white, so WCAG 1.4.11's state cue is carried by shape.
 *
 * <p>Picker geometry, to re-derive if any of it moves: each dot is a 44 px control with the dot
 * painted inside it, so dot centres sit 44 px apart and the widest dot is the 18 px active pill —
 * the strip spans 13…(44n − 13) and the rail's pill is that plus 7 × 5 px of padding, held at the
 * widest case so the rail cannot resize mid-step. At most three photos exist (`PhotoSlot`).
 *
 * <p>The dot rail sits AFTER the step buttons in the template: both take `z-10`, so DOM order is
 * the tie-break, and any overlap on a short band must fall to the dots — a step button's chip is
 * opaque where its padding is not. The position live region stays mounted for the component's whole
 * life rather than inside the branch it announces; the shape and why the alternative reads as
 * silence are `shared/load-announcer.ts`.
 *
 * <p>`testId` prefixes the hooks: `{testId}-img` (first slide), `{testId}-slide-img` (rest),
 * `{testId}-dots`, and with own controls `{testId}-prev`/`{testId}-next`, `{testId}-dot-{i}` and
 * `{testId}-position`. `name` gives the control labels their subject.
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
        <!-- The APG carousel's slide picker; its geometry is derived in the class doc. -->
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
   * What share of the viewport a slide occupies, for the `srcset` fallback. Responsive values only
   * — a pixel value throws (`NgOptimizedImage` RuntimeError 2952). Left unset it becomes `100vw`,
   * which over-states every band narrower than the page and makes the browser fetch the widest
   * candidate, so a host in a grid or a breakout column passes its own.
   *
   * <p>Only the fallback: the directive prefixes `auto,` on a lazy image, and a browser honouring
   * `sizes="auto"` measures the laid-out box instead. Must be constant for a given instance —
   * `assertNoPostInitInputChange` covers `sizes`.
   */
  readonly sizes = input<string>();

  /** Letterbox instead of crop — the lightbox's roomier, closer-to-square box can afford to
   *  show a portrait photo whole; the header/card bands stay cropped (the default). */
  readonly contain = input(false, { transform: booleanAttribute });

  /**
   * Mark the first slide as the page's LCP image (`fetchpriority=high`, eager, a preload link) —
   * angular.dev's image guide asks for exactly one such image per page, and warns in the console
   * when the LCP element is not it. The beach-map banner sets it; the Discover grid deliberately
   * does not (24 competing preloads is the harm the attribute exists to prevent) and neither does
   * the lightbox, which only ever opens over an already-painted page.
   *
   * <p>Must be constant for a given instance: `NgOptimizedImage` throws on a post-init `priority`
   * change (`assertNoPostInitInputChange`). Every call site sets it statically.
   */
  readonly priority = input(false, { transform: booleanAttribute });

  /** The slide shown on mount (0-based) — the lightbox opens on whichever photo was tapped;
   *  every other host leaves this at the default first slide. */
  readonly startIndex = input(0);

  /**
   * The photo list's CONTENT, as the reset key for everything below.
   *
   * <p>Keying on the `photos` input itself would key on array IDENTITY, and `pages/home`'s card
   * views are rebuilt inside a `computed()` — every re-derivation of the venue list handed the
   * component a fresh array holding the same URLs and snapped every card back to slide 1
   * mid-browse. Joining the baseline URLs is enough: they are content-addressed, so a list whose
   * URLs all match in order IS the same slideshow, candidates included.
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
   * ArrowLeft/ArrowRight step the band whenever focus is inside it (WCAG 2.1.1).
   *
   * <p>`stopPropagation` is load-bearing, not tidiness: a host may bind the same keys on an
   * ancestor to catch focus that never reaches us — {@link PhotoLightbox} does, because the
   * dialog opens focus on a close button that is our SIBLING. Our own step buttons and dot
   * picker are our DESCENDANTS, so without this an arrow pressed on one bubbles into that
   * ancestor handler too and advances two slides for one keypress.
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
   * Begin a gesture.
   *
   * <p>`isPrimary` is consulted ONLY to break the tie when a gesture is already in flight: a
   * non-primary pointer there is a genuine second finger, so the gesture is dropped rather than
   * one finger's release measured against the other's origin. Any other press starts fresh, which
   * is what keeps a `pointerup` the browser never delivered (and never cancelled) from swallowing
   * the next real swipe — and what keeps the band working if `isPrimary` is not populated at all,
   * rather than silently refusing to swipe.
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
