import { NgOptimizedImage } from '@angular/common';
import { Component, input, output } from '@angular/core';

import { CONTAIN_SIZES, photoSrcset } from './photo-url';
import { TouchTarget } from './touch-target';
import { PhotoView } from './venue-views';

/**
 * The venue detail page's wide photo lead: a large cover tile beside up to two smaller
 * supporting tiles, filling the beach map's 1100px breakout instead of the identity card's
 * narrower 780px shell, whose width split is otherwise unbridged between the header and the
 * map. Only worth it once a venue actually has more than one photo — with 0 or 1, the caller
 * keeps the existing single-photo band inside the header, so this component is never asked to
 * render fewer than 2 photos.
 *
 * Each tile letterboxes rather than crops (`object-contain` over a blurred, scaled copy of the
 * same photo) — an odd-aspect upload (a tall portrait cover shot) stayed whole in the lightbox and
 * the single-photo band already; a cropped hero/tile disagreed with both. The blurred copy is a
 * plain CSS background (not a second `NgOptimizedImage`, which warns on a duplicate `ngSrc`) so the
 * letterbox bars pick up the photo's own edge colour instead of the flat placeholder gradient,
 * which still backs the button underneath as the pre-paint/no-photo fallback. Each tile is a
 * labelled button — tapping one emits {@link opened} with that photo's index, so the caller can
 * mount a {@link PhotoLightbox} seeded at the tapped photo; the image itself stays `alt=""` since
 * the button's own label already names the action.
 *
 * <p>Letterboxing is also why each tile's `sizes` comes from {@link CONTAIN_SIZES}, which states
 * the width the PAINTED photo needs rather than the tile's own. The side tiles are lazy, so
 * Chromium resolves their `auto` prefix against the tile box and the authored value reaches only
 * engines without `sizes=auto`; the eager hero's reaches every engine.
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
        class="relative col-span-2 row-span-2 block h-full w-full cursor-zoom-in touch-manipulation overflow-hidden bg-(image:--riv-photo-grad) focus-visible:-outline-offset-[3px] focus-visible:outline-white"
        data-testid="gallery-photo-0"
        [attr.aria-label]="tileLabel(0)"
        (click)="opened.emit(0)"
      >
        <div
          aria-hidden="true"
          class="absolute inset-0 scale-110 bg-cover bg-center brightness-90 blur-2xl"
          [style.background-image]="'url(' + photos()[0].url + ')'"
          data-testid="gallery-hero-backdrop"
        ></div>
        <img
          [ngSrc]="photos()[0].url"
          [attr.srcset]="srcsetOf(photos()[0])"
          disableOptimizedSrcset
          [sizes]="sizes.galleryHero"
          fill
          priority
          class="relative object-contain"
          alt=""
          data-testid="gallery-hero"
        />
      </button>
      @if (photos()[1]; as second) {
        <!-- Exactly 2 photos: fill the whole right column instead of leaving row 2 empty. -->
        <button
          type="button"
          appTouchTarget
          class="relative col-start-3 row-start-1 block h-full w-full cursor-zoom-in touch-manipulation overflow-hidden bg-(image:--riv-photo-grad) focus-visible:-outline-offset-[3px] focus-visible:outline-white"
          [class.row-span-2]="!photos()[2]"
          data-testid="gallery-photo-1"
          [attr.aria-label]="tileLabel(1)"
          (click)="opened.emit(1)"
        >
          <div
            aria-hidden="true"
            class="absolute inset-0 scale-110 bg-cover bg-center brightness-90 blur-2xl"
            [style.background-image]="'url(' + second.url + ')'"
            data-testid="gallery-tile-backdrop"
          ></div>
          <img
            [ngSrc]="second.url"
            [attr.srcset]="srcsetOf(second)"
            disableOptimizedSrcset
            [sizes]="sizes.gallerySideTile"
            fill
            class="relative object-contain"
            alt=""
            data-testid="gallery-tile"
          />
        </button>
      }
      @if (photos()[2]; as third) {
        <button
          type="button"
          appTouchTarget
          class="relative col-start-3 row-start-2 block h-full w-full cursor-zoom-in touch-manipulation overflow-hidden bg-(image:--riv-photo-grad) focus-visible:-outline-offset-[3px] focus-visible:outline-white"
          data-testid="gallery-photo-2"
          [attr.aria-label]="tileLabel(2)"
          (click)="opened.emit(2)"
        >
          <div
            aria-hidden="true"
            class="absolute inset-0 scale-110 bg-cover bg-center brightness-90 blur-2xl"
            [style.background-image]="'url(' + third.url + ')'"
            data-testid="gallery-tile-backdrop"
          ></div>
          <img
            [ngSrc]="third.url"
            [attr.srcset]="srcsetOf(third)"
            disableOptimizedSrcset
            [sizes]="sizes.gallerySideTile"
            fill
            class="relative object-contain"
            alt=""
            data-testid="gallery-tile"
          />
        </button>
      }
    </div>
  `,
})
export class PhotoGalleryGrid {
  /** Each tile letterboxes, so it states the width its PAINTED photo needs. */
  protected readonly sizes = CONTAIN_SIZES;

  /** Caller guarantees length >= 2 — see the class doc. */
  readonly photos = input.required<readonly PhotoView[]>();
  /** The subject named in each tile's accessible label. */
  readonly name = input('');
  /** The tapped tile's photo index, for the caller to seed a lightbox. */
  readonly opened = output<number>();

  /** `null` rather than a one-entry attribute — with a single candidate, `src` already says it. */
  protected srcsetOf(photo: PhotoView): string | null {
    return photoSrcset(photo);
  }

  protected tileLabel(index: number): string {
    const subject = this.name() ? ` of ${this.name()}` : '';
    return `View photo ${index + 1} of ${this.photos().length}${subject}`;
  }
}
