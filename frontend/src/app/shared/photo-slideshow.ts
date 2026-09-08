import { NgOptimizedImage } from '@angular/common';
import { booleanAttribute, Component, computed, input, linkedSignal } from '@angular/core';

import { PhotoStepButton } from './photo-step-button';
import { TouchTarget } from './touch-target';

/**
 * How far a finger must travel horizontally before it counts as a step rather than a tap. 40 px is
 * wide enough that the tap which opens the lightbox (or follows the Discover card's link) still
 * reads as a tap on a shaky hand, and short enough to feel like a flick on a 150 px band.
 */
const SWIPE_THRESHOLD_PX = 40;

/**
 * A crossfading photo slideshow: an absolutely-filled slide stack with dot indicators, prev/next
 * stepping, arrow keys and touch swipe, wrapping at either end. The host fills its nearest
 * positioned ancestor (`absolute inset-0`), so consumers drop it into any photo band; with no
 * photos it renders nothing and the band's own background shows through.
 *
 * Controls come in two placements, because a control nested inside a link is invalid HTML and
 * an axe failure:
 * - `ownControls` (the beach-map banner, the lightbox): the component renders its own labelled step
 *   buttons, its dot rail as an APG slide picker, and the live region that announces the position.
 *   The images layer is `aria-hidden`; the controls are not, so never place this mode inside a link
 *   or an `aria-hidden` subtree. Today that chrome only ever paints in the LIGHTBOX — the banner
 *   yields to the gallery grid at two photos, so it is only ever handed one.
 * - external (the Discover card, whose whole card is an `<a>`): leave `ownControls` unset and
 *   drive {@link prev}/{@link next} from buttons OUTSIDE the link via a template reference. The
 *   dots stay inert `<span>`s there — a picker inside the card's `<a>` would be the very nesting
 *   this split exists to avoid — and the host renders {@link positionLabel} in its own live region,
 *   beside those external buttons.
 *
 * The chrome (dot rail, step chips) carries its OWN backing rather than leaning on a host's
 * scrim — it paints above that scrim, and an uploaded photo can be any colour; the alphas are
 * proven at 3:1 over the worst case in `photo-slideshow.contrast.spec.ts`.
 *
 * <p>The current slide's dot is a WIDER PILL, not just a brighter dot. Once the dots became a
 * picker, "which slide is current" is a control state, and WCAG 1.4.11 wants that visible: white
 * against white-at-65% is nowhere near 3:1, and no pair of alphas can be, since the inactive dot
 * must ALSO clear 3:1 against the rail it sits on — two 3:1 steps do not fit between the rail and
 * white. Shape carries the state instead, which leaves both colour proofs exactly as they were.
 * The inert Discover rail wears the same treatment so the two placements stay one design.
 *
 * <p><b>The picker's geometry.</b> Each dot is a real 44 px control (WCAG 2.5.5) with the dot
 * PAINTED inside it — `riviera-tailwind` rule 4's split of paint from target — so the rail keeps
 * its 18 px-tall pill instead of growing into a 44 px slab. That makes the pill a separate box,
 * because the dots are now 44 px apart: centres land at 22, 66, 110, the widest a dot gets is the
 * 18 px active pill, so the strip spans 13…(44n − 13) and the pill is that plus the rail's 7 × 5 px
 * padding — `inset-x-[6px] inset-y-[13px]`, held at the WIDEST case so the rail cannot resize as
 * the tourist steps. `right-[7px]` puts the pill's right edge at the 13 px inset the rail has
 * always had; `bottom-0` leaves it 13 px up. At most three photos exist (the backend's
 * COVER/SUNBEDS/BAR slots), so the rail is never wider than 132 px. It sits after the step buttons
 * so a tie on `z-10` falls to the dots: any overlap on a short band is with a step button's
 * TRANSPARENT padding, never its chip.
 *
 * <p>Stepping is otherwise SILENT: the imagery is `aria-hidden`, so a screen reader hears the
 * button's own label and nothing about what changed. Hence {@link positionLabel} and, with own
 * controls, the live region carrying it — mounted for the component's whole life rather than
 * inside the branch it announces, so the first render is not itself the mutation. That shape, and
 * why the alternative reads as silence, is `shared/load-announcer.ts`.
 *
 * <p><b>Only the slides the tourist has actually reached are in the DOM.</b> `NgOptimizedImage`
 * lazy-loads non-priority images, but a lazy `<img>` that is `opacity-0` on top of the visible one
 * still intersects the viewport, so the browser fetches it: the old always-render-every-slide stack
 * cost Discover one request per photo per card — a 24-card grid of fully-photographed venues is 72
 * — before first paint. Slides
 * are therefore mounted as they are visited, and only once the tourist has stepped ONCE does the
 * current slide's `load` warm its two neighbours — so an idle Discover grid pays for one image per
 * card, and a tourist who is actually browsing a venue's photos never waits twice. The cost is that
 * the FIRST step crossfades to an image still arriving; the band's gradient shows through for that
 * frame, which is the trade the request count is worth.
 *
 * `testId` prefixes the test hooks: `{testId}-img` (first slide), `{testId}-slide-img` (rest),
 * `{testId}-dots`, and — with own controls — `{testId}-prev` / `{testId}-next`, `{testId}-dot-{i}`
 * and `{testId}-position`. `name` gives the control labels their subject ("Next photo, Miramar
 * Beach Club").
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
            [ngSrc]="photo"
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
              class="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-white"
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
        <!-- The position announcement stepping would otherwise make silently; see the class doc. -->
        <p
          class="sr-only"
          role="status"
          aria-live="polite"
          [attr.data-testid]="testId() + '-position'"
        >
          {{ positionLabel() }}
        </p>
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
  readonly photos = input.required<readonly string[]>();
  /** The subject named in the step controls' accessible labels. */
  readonly name = input('');
  /** Prefix for the slide/dots/controls test hooks. */
  readonly testId = input('photo');
  /** Render the component's own step buttons — only for hosts NOT inside a link/aria-hidden tree. */
  readonly ownControls = input(false, { transform: booleanAttribute });

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
   * mid-browse. A join is enough: these are opaque server paths, and a list whose strings all match
   * in order IS the same slideshow.
   */
  private readonly photosKey = computed(() => this.photos().join('\n'));

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

  /** Horizontal/vertical origin of the gesture in flight, or `undefined` when none is. */
  private swipeFrom: { readonly x: number; readonly y: number } | undefined;
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

  /** ArrowLeft/ArrowRight step the band whenever focus is inside it (WCAG 2.1.1). */
  protected onArrow(event: Event, delta: 1 | -1): void {
    if (this.photos().length < 2) {
      return;
    }
    // Otherwise the arrow also scrolls the page under the lightbox / the venue header.
    event.preventDefault();
    this.step(delta);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.swipeConsumedClick = false;
    // Touch and pen only — on Discover the band IS the card's link, and a mouse wobble must not eat it.
    this.swipeFrom =
      event.pointerType === 'mouse' || this.photos().length < 2
        ? undefined
        : { x: event.clientX, y: event.clientY };
  }

  protected onPointerUp(event: PointerEvent): void {
    const from = this.swipeFrom;
    this.swipeFrom = undefined;
    if (!from) {
      return;
    }
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
