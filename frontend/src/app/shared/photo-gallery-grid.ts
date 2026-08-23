import { NgOptimizedImage } from '@angular/common';
import { Component, input, output } from '@angular/core';

import { TouchTarget } from './touch-target';

/**
 * The venue detail page's wide photo lead: a large cover tile beside up to two smaller
 * supporting tiles, filling the beach map's 1100px breakout instead of the identity card's
 * narrower 780px shell (#700's width split is otherwise unbridged between the header and the
 * map). Only worth it once a venue actually has more than one photo — with 0 or 1, the caller
 * keeps the existing single-photo band inside the header, so this component is never asked to
 * render fewer than 2 photos.
 *
 * Each tile letterboxes rather than crops (`object-contain` over the same sea-gradient placeholder
 * the header band uses) — an odd-aspect upload (a tall portrait cover shot) stayed whole in the
 * lightbox and the single-photo band already; a cropped hero/tile disagreed with both. Each tile
 * is a labelled button — tapping one emits {@link opened} with that photo's index, so the caller
 * can mount a {@link PhotoLightbox} seeded at the tapped photo; the image itself stays `alt=""`
 * since the button's own label already names the action.
 */
@Component({
  selector: 'app-photo-gallery-grid',
  imports: [NgOptimizedImage, TouchTarget],
  template: `
    <div
      class="grid h-[220px] grid-cols-3 grid-rows-2 gap-2 overflow-hidden rounded-[26px] min-[1024px]:h-[360px]"
    >
      <button
        type="button"
        appTouchTarget
        class="relative col-span-2 row-span-2 block h-full w-full cursor-zoom-in bg-(image:--riv-photo-grad)"
        data-testid="gallery-photo-0"
        [attr.aria-label]="tileLabel(0)"
        (click)="opened.emit(0)"
      >
        <img
          [ngSrc]="photos()[0]"
          fill
          priority
          class="object-contain"
          alt=""
          data-testid="gallery-hero"
        />
      </button>
      @if (photos()[1]; as second) {
        <!-- Exactly 2 photos: fill the whole right column instead of leaving row 2 empty. -->
        <button
          type="button"
          appTouchTarget
          class="relative col-start-3 row-start-1 block h-full w-full cursor-zoom-in bg-(image:--riv-photo-grad)"
          [class.row-span-2]="!photos()[2]"
          data-testid="gallery-photo-1"
          [attr.aria-label]="tileLabel(1)"
          (click)="opened.emit(1)"
        >
          <img [ngSrc]="second" fill class="object-contain" alt="" data-testid="gallery-tile" />
        </button>
      }
      @if (photos()[2]; as third) {
        <button
          type="button"
          appTouchTarget
          class="relative col-start-3 row-start-2 block h-full w-full cursor-zoom-in bg-(image:--riv-photo-grad)"
          data-testid="gallery-photo-2"
          [attr.aria-label]="tileLabel(2)"
          (click)="opened.emit(2)"
        >
          <img [ngSrc]="third" fill class="object-contain" alt="" data-testid="gallery-tile" />
        </button>
      }
    </div>
  `,
})
export class PhotoGalleryGrid {
  /** Caller guarantees length >= 2 — see the class doc. */
  readonly photos = input.required<readonly string[]>();
  /** The subject named in each tile's accessible label. */
  readonly name = input('');
  /** The tapped tile's photo index, for the caller to seed a lightbox. */
  readonly opened = output<number>();

  protected tileLabel(index: number): string {
    const subject = this.name() ? ` of ${this.name()}` : '';
    return `View photo ${index + 1} of ${this.photos().length}${subject}`;
  }
}
