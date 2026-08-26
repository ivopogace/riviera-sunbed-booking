import { Component, input } from '@angular/core';

import { BeachMapCanvas, BeachMapRowDef } from './beach-map-canvas';
import { MAP_SKELETON_ROWS, MAP_SKELETON_TILES } from './map-skeleton';
import { SkeletonBlock } from './skeleton-block';

/**
 * The in-flight tile grid every beach-map surface renders through {@link BeachMapCanvas} while
 * loading (#744) — same geometry, same canvas, different testids and tile radius per surface.
 */
@Component({
  selector: 'app-map-skeleton-grid',
  imports: [BeachMapCanvas, BeachMapRowDef, SkeletonBlock],
  host: { class: 'block' },
  template: `
    <app-beach-map-canvas
      [frameTestid]="frameTestid()"
      [viewportTestid]="viewportTestid()"
      [railCodes]="railCodes()"
      [priceChips]="priceChips()"
      [fitWidth]="fitWidth()"
      [loading]="true"
    >
      <ng-template [appBeachMapRow]="rows">
        <div class="grid h-full grid-cols-[repeat(var(--riv-map-cols,1),var(--riv-tile))] gap-1.5">
          @for (tile of tiles; track tile) {
            <span
              appSkeletonBlock
              class="bg-riv-card-track h-full min-w-0"
              [class]="tileRadiusClass()"
              [attr.data-testid]="tileTestid()"
            ></span>
          }
        </div>
      </ng-template>
    </app-beach-map-canvas>
  `,
})
export class MapSkeletonGrid {
  readonly frameTestid = input('beach-grid');
  readonly viewportTestid = input.required<string>();
  readonly tileTestid = input.required<string>();
  readonly tileRadiusClass = input.required<string>();
  readonly railCodes = input<'letters' | 'labels' | 'capped-labels'>('letters');
  readonly priceChips = input<'amounts' | 'capped-phrases'>('amounts');
  readonly fitWidth = input(false);

  protected readonly rows = MAP_SKELETON_ROWS;
  protected readonly tiles = MAP_SKELETON_TILES;
}
