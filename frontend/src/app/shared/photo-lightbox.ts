import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

import { trapFocusWithin } from './focus-trap';
import { PhotoSlideshow } from './photo-slideshow';
import { TouchTarget } from './touch-target';

/**
 * A modal, larger-scale view of a venue's photos, opened by tapping a thumbnail in either the
 * gallery grid or the single-photo band. Delegates the crossfade/stepping to {@link PhotoSlideshow}
 * (own controls, seeded at the tapped photo via `startIndex`, letterboxed via `contain` rather than
 * the bands' crop — this box is roomier and closer to square, so a portrait photo fits whole) and
 * adds the modal's own chrome: a close button, a dismissing backdrop, Escape, and a focus trap — the
 * sixth modal in this shape, alongside the booking dialog, find-booking, the payout statement, the
 * availability calendar and the console's jump palette (`shared/focus-trap.ts`).
 *
 * The caller owns returning focus to the thumbnail that opened it (RV-FE-9) — this component only
 * emits {@link dismissed}.
 *
 * <p>Arrow keys are bound HERE as well as on the slideshow: focus opens on the close button, which
 * is the slideshow's SIBLING, so a keydown there never reaches it, and the dialog is the region the
 * tourist is actually in. Focus ON the slideshow's own controls is the other half, and the
 * slideshow keeps that case to itself — `PhotoSlideshow.onArrow` stops the event rather than let
 * both handlers step it.
 */
@Component({
  selector: 'app-photo-lightbox',
  imports: [PhotoSlideshow, TouchTarget],
  host: {
    class:
      'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,18,24,0.86)] p-4 backdrop-blur-[6px]',
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': 'ariaLabel()',
    '(click)': 'dismissed.emit()',
    '(keydown.escape)': 'dismissed.emit()',
    '(keydown.arrowleft)': 'step($event, -1)',
    '(keydown.arrowright)': 'step($event, 1)',
  },
  template: `
    <div
      tabindex="-1"
      class="relative flex h-[min(88vh,900px)] w-[min(94vw,1100px)] items-center justify-center overflow-hidden rounded-[18px] bg-black/40"
      (click)="$event.stopPropagation()"
      (keydown.tab)="trapFocus($event, false)"
      (keydown.shift.tab)="trapFocus($event, true)"
    >
      <app-photo-slideshow
        [photos]="photos()"
        [startIndex]="startIndex()"
        [name]="name()"
        testId="lightbox"
        ownControls
        contain
      />
      <button
        type="button"
        appTouchTarget
        class="group absolute top-2 right-2 z-20 inline-flex size-11 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-black/55 backdrop-blur-[10px] [transition:background_0.15s_ease] hover:bg-black/70 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white"
        data-testid="lightbox-close"
        aria-label="Close photo viewer"
        (click)="dismissed.emit()"
      >
        <span aria-hidden="true" class="text-[20px] leading-none text-white">✕</span>
      </button>
    </div>
  `,
})
export class PhotoLightbox {
  readonly photos = input.required<readonly string[]>();
  /** Which photo to open on — the tile/slide the tourist tapped. */
  readonly startIndex = input(0);
  /** The subject named in the dialog's accessible label and the slideshow's step controls. */
  readonly name = input('');
  readonly dismissed = output<void>();

  protected readonly ariaLabel = computed(() =>
    this.name() ? `Photos of ${this.name()}` : 'Photos',
  );

  private readonly slideshow = viewChild.required(PhotoSlideshow);

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      this.hostRef.nativeElement
        .querySelector<HTMLElement>('[data-testid="lightbox-close"]')
        ?.focus();
    });
  }

  /** Step the photos from anywhere in the dialog, and keep the arrow off the page behind it. */
  protected step(event: Event, delta: 1 | -1): void {
    event.preventDefault();
    if (delta === 1) {
      this.slideshow().next();
    } else {
      this.slideshow().prev();
    }
  }

  /** Keep keyboard focus inside the dialog (WCAG 2.4.3 / 2.1.2) — shared trap. */
  protected trapFocus(event: Event, backwards: boolean): void {
    trapFocusWithin(this.hostRef.nativeElement, event, backwards);
  }
}
