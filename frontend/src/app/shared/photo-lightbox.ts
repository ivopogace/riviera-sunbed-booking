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
import { PhotoView } from './venue-views';
import { CrossIcon } from './cross-icon';

/**
 * Modal viewer of a venue's photos, opened from a gallery-grid or single-photo-band thumbnail:
 * {@link PhotoSlideshow} (own controls, seeded via `startIndex`, letterboxed via `contain`) plus a
 * close button, dismissing backdrop, Escape and a focus trap (`shared/focus-trap.ts`). The caller
 * returns focus to the opening thumbnail (RV-FE-9); this only emits {@link dismissed}. Arrows are
 * bound here too — focus opens on the close button, the slideshow's sibling, whose keydown it never
 * sees; `PhotoSlideshow.onArrow` stops propagation so one press never steps twice.
 */
@Component({
  selector: 'app-photo-lightbox',
  imports: [PhotoSlideshow, TouchTarget, CrossIcon],
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
        sizes="94vw"
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
        <app-cross-icon class="text-white [&_svg]:size-[18px]" />
      </button>
    </div>
  `,
})
export class PhotoLightbox {
  readonly photos = input.required<readonly PhotoView[]>();
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
