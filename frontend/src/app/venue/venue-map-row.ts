import { Component, input, output } from '@angular/core';

import { CheckIcon } from '../shared/check-icon';
import { TouchTarget } from '../shared/touch-target';
import { SetView } from '../shared/venue-views';
import { MapTile, MapTileState } from './map-tile';

/**
 * One rendered set on the map: the raw {@link SetView}, whether it is bookable
 * (invariant #3), and its accessible name (state carried by text, not colour — WCAG AA).
 */
export interface TileView {
  readonly set: SetView;
  readonly bookable: boolean;
  /** How the tile looks and what it announces — the appearance, the markers and the legend
   *  swatches all resolve from this one value (a FREE walk-in set is `walkin`). */
  readonly state: MapTileState;
  /** Accessible name for a non-interactive tile (`<li>`). */
  readonly name: string;
  /** Accessible name for the bookable button (adds the "Select to book" affordance). */
  readonly bookName: string;
  /** Free on some of the stay's days: tappable to see which, never bookable as it stands. */
  readonly partly: boolean;
  /** How many of the stay's days the set is free on — the badge a partly-free tile wears. */
  readonly freeDays: number;
  /** Accessible name for the partly-free button (adds the "see which days" affordance). */
  readonly partlyName: string;
  /** The set's 1-based place in the open stitched plan, or undefined when it is not in it. */
  readonly planIndex: number | undefined;
  /** The `--riv-plan-fill` value of that place, the stretch token the plan colours it with. */
  readonly planFill: string | null;
  /** That place's ring colour on the phone overview, where the cell sits on the map wash. */
  readonly planRing: string | null;
  /** The visitor's pick: phone widths only, and only ever a bookable set. */
  readonly picked: boolean;
}

/**
 * One row of the tourist map's 44px tiles, the same markup under the canvas (`sm` up) and in the
 * phone lens's open row. The host IS the `<ul>`, so the call site owns the row's layout; the tiles
 * own their looks, badges and names. `pressable` turns a bookable tile into a pressed/unpressed
 * toggle (the phone's pick); without it the tile is a plain button, as from `sm` up.
 */
@Component({
  selector: 'ul[appVenueMapRow]',
  imports: [CheckIcon, MapTile, TouchTarget],
  template: `
    @for (tile of tiles(); track tile.set.id) {
      <li
        appMapTile
        [state]="tile.state"
        [picked]="tile.picked"
        class="set-tile relative snap-start h-full min-w-0 flex items-center justify-center rounded-[10px] border-[1.5px] font-bold text-[12.5px] [&.bookable]:p-0 [&.partly]:p-0 data-[state=partly]:border-2 [&.inplan]:shadow-[0_0_0_3px_var(--riv-plan-fill)] [&.picked_.set-button:hover]:bg-transparent"
        data-testid="set-tile"
        [class.premium]="tile.state === 'premium'"
        [class.partly]="tile.state === 'partly'"
        [class.walkin]="tile.state === 'walkin'"
        [class.taken]="tile.state === 'taken'"
        [class.bookable]="tile.bookable"
        [class.inplan]="tile.planIndex !== undefined"
        [class.picked]="tile.picked"
        [style.--riv-plan-fill]="tile.planFill"
        [attr.data-plan-index]="tile.planIndex ?? null"
        [attr.aria-label]="tile.bookable || tile.partly ? null : tile.name"
      >
        @if (tile.planIndex !== undefined) {
          <!-- Inside the tile's box, so the disc adds no touch target; aria-hidden because the plan panel names each stop. -->
          <span
            class="pointer-events-none absolute -top-1.5 -left-1.5 z-[2] grid size-[16px] place-items-center rounded-full bg-(--riv-plan-fill) text-[9px] leading-none font-bold text-riv-stretch-ink"
            data-testid="plan-number"
            aria-hidden="true"
            >{{ tile.planIndex }}</span
          >
        }
        @if (tile.state === 'partly') {
          <!-- Inside the existing button's box, so the badge adds no touch target; aria-hidden because the name already says "free k of N days". -->
          <span
            class="pointer-events-none absolute top-[3px] right-[3px] z-[2] grid h-[15px] min-w-[16px] place-items-center rounded-full bg-riv-tile-badge-fill px-[3px] text-[9px] leading-none font-bold text-riv-tile-badge-ink"
            data-testid="free-days-badge"
            aria-hidden="true"
            >{{ tile.freeDays }}</span
          >
        }
        @if (tile.picked) {
          <!-- aria-hidden: the button's pressed state says it. The colours invert the tile's, so the tick reads on the solid fill. -->
          <span
            class="pointer-events-none absolute -top-[7px] -right-[5px] z-[2] grid size-[18px] place-items-center rounded-full border-[1.5px] border-riv-tile-pick-fill bg-riv-tile-pick-ink text-riv-tile-pick-fill [&_svg]:size-[11px]"
            data-testid="pick-tick"
            aria-hidden="true"
            ><app-check-icon
          /></span>
        }
        @if (tile.partly) {
          <button
            appTouchTarget
            type="button"
            class="set-button w-full h-full flex items-center justify-center border-0 rounded-[inherit] bg-transparent text-inherit cursor-pointer touch-manipulation [transition:background_0.15s_ease,translate_0.12s_ease] hover:bg-riv-tile-hover hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-[3px] focus-visible:outline-riv-tile-focus focus-visible:outline-offset-2"
            [attr.data-set-id]="tile.set.id"
            [attr.aria-label]="tile.partlyName"
            (click)="days.emit(tile.set)"
          >
            <span aria-hidden="true">{{ tile.set.positionNo }}</span>
          </button>
        } @else if (tile.bookable) {
          <button
            appTouchTarget
            type="button"
            class="set-button w-full h-full flex items-center justify-center border-0 rounded-[inherit] bg-transparent text-inherit cursor-pointer touch-manipulation [transition:background_0.15s_ease,translate_0.12s_ease] hover:bg-riv-tile-hover hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-[3px] focus-visible:outline-riv-tile-focus focus-visible:outline-offset-2"
            [attr.data-set-id]="tile.set.id"
            [attr.aria-label]="tile.bookName"
            [attr.aria-pressed]="pressable() ? tile.picked : null"
            (click)="chosen.emit(tile.set)"
          >
            <span aria-hidden="true">{{ tile.set.positionNo }}</span>
          </button>
        } @else {
          <span aria-hidden="true">{{ tile.set.positionNo }}</span>
        }
      </li>
    }
  `,
})
export class VenueMapRow {
  readonly tiles = input.required<readonly TileView[]>();
  /** Bookable tiles expose a pressed state: a tap picks, a second tap unpicks. */
  readonly pressable = input(false);
  /** A bookable tile was tapped. */
  readonly chosen = output<SetView>();
  /** A partly-free tile was tapped: show which days it is free. */
  readonly days = output<SetView>();
}
