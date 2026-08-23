import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';

/**
 * The venue detail page's wide photo lead: a large cover tile beside up to two smaller
 * supporting tiles, filling the beach map's 1100px breakout instead of the identity card's
 * narrower 780px shell (#700's width split is otherwise unbridged between the header and the
 * map). Only worth it once a venue actually has more than one photo — with 0 or 1, the caller
 * keeps the existing single-photo band inside the header, so this component is never asked to
 * render fewer than 2 photos.
 *
 * Purely decorative, like the slideshow band it sits above: `alt=""` throughout, no controls.
 * A future click-to-expand gallery is a separate change.
 */
@Component({
  selector: 'app-photo-gallery-grid',
  imports: [NgOptimizedImage],
  template: `
    <div
      class="grid h-[220px] grid-cols-3 grid-rows-2 gap-2 overflow-hidden rounded-[26px] min-[1024px]:h-[360px]"
    >
      <div class="relative col-span-2 row-span-2">
        <img
          [ngSrc]="photos()[0]"
          fill
          priority
          class="object-cover"
          alt=""
          data-testid="gallery-hero"
        />
      </div>
      @if (photos()[1]; as second) {
        <!-- Exactly 2 photos: fill the whole right column instead of leaving row 2 empty. -->
        <div class="relative col-start-3 row-start-1" [class.row-span-2]="!photos()[2]">
          <img [ngSrc]="second" fill class="object-cover" alt="" data-testid="gallery-tile" />
        </div>
      }
      @if (photos()[2]; as third) {
        <div class="relative col-start-3 row-start-2">
          <img [ngSrc]="third" fill class="object-cover" alt="" data-testid="gallery-tile" />
        </div>
      }
    </div>
  `,
})
export class PhotoGalleryGrid {
  /** Caller guarantees length >= 2 — see the class doc. */
  readonly photos = input.required<readonly string[]>();
}
