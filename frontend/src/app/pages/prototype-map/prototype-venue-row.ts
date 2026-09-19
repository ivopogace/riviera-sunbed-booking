/**
 * PROTOTYPE — throwaway. The phone row: one per venue, the photo a 72 px square on the left, the
 * three facts a tourist on the beach decides on — name, price, sets free — at a size that reads
 * in glare, and the whole row the link. It is also the pin's PREVIEW: a pin press scrolls to its
 * row and lights it, because a second card over the map has nowhere to go.
 *
 * <p>On the desktop the row is `flat`: the panel is already a surface, so a card on it was a third
 * nested rounded box (round 10 — the "SaaS-card kit" tell), and the rows become a list.
 *
 * <p>A venue whose sales for today have closed (invariant #4) keeps its row but drops into dusk
 * and says so, and the row's price gives way to the fact that matters more. Dusk is desaturation
 * and a flat card, never a faded one: a 60 % row put its name under 3:1 in every theme (round 7).
 */
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AmenityChip } from '../../shared/amenity-chip';
import { SemanticChip } from '../../shared/semantic-chip';
import { VenueCard } from '../home/venue-card';

@Component({
  selector: 'app-prototype-venue-row',
  imports: [RouterLink, SemanticChip, AmenityChip],
  host: { class: 'block' },
  template: `
    <a
      [class]="flat() ? FLAT : CARD"
      [class.saturate-0]="dusk()"
      [class.shadow-none]="dusk()"
      [attr.data-row]="card().id"
      [routerLink]="['/venues', card().id]"
      [queryParams]="{ date: date() }"
      [attr.aria-label]="card().ariaLabel"
      [attr.aria-current]="selected() ? 'true' : null"
      (click)="pressed.emit(card().id)"
    >
      <span
        class="relative block size-[72px] shrink-0 overflow-hidden rounded-[12px] bg-(image:--riv-photo-grad)"
        aria-hidden="true"
      >
        <img class="absolute inset-0 size-full object-cover" [src]="card().photos[0].url" alt="" />
      </span>
      <span class="flex min-w-0 flex-1 flex-col justify-between py-0.5" aria-hidden="true">
        <span class="flex items-baseline justify-between gap-2">
          <span class="truncate text-[16px] leading-[1.15] font-bold text-riv-card-ink">
            {{ card().name }}
          </span>
          @if (dusk()) {
            <span appSemanticChip class="shrink-0 px-[8px] py-px text-[10.5px]">Closed today</span>
          } @else {
            <strong class="shrink-0 text-[16px] font-extrabold text-riv-accent-ink">
              {{ card().priceLabel }}
            </strong>
          }
        </span>
        <span class="flex items-center gap-[6px] text-[13px] text-riv-card-ink-soft">
          @if (card().isRated) {
            <span class="text-[#f4a939]" aria-hidden="true">★</span>
            <span class="font-bold text-riv-card-ink">{{ card().rating }}</span>
          } @else {
            <span appSemanticChip class="px-[7px] py-px text-[10.5px]">New</span>
          }
          @if (card().water; as water) {
            <span class="opacity-30" aria-hidden="true">·</span>
            <span class="truncate">{{ water }}</span>
          }
          @if (km() !== null) {
            <span class="opacity-30" aria-hidden="true">·</span>
            <span class="shrink-0">{{ km() }}</span>
          }
        </span>
        <!-- The third fact, sized as one: a 72 px bar beside the number, not a bar the row's width. -->
        <span class="flex items-center gap-2">
          <span class="shrink-0 text-[12.5px] text-riv-card-ink-soft">
            <strong class="text-riv-card-ink">{{ card().free }}</strong> of {{ card().total }} free
          </span>
          <span class="block h-1.5 w-[72px] overflow-hidden rounded-full bg-riv-card-track">
            <span
              class="block h-full bg-(image:--riv-bar-grad)"
              [style.width.%]="card().freePercent"
            ></span>
          </span>
        </span>
      </span>
    </a>
    @if (chips()) {
      <span class="mt-1.5 flex flex-wrap gap-1.5 px-1" aria-hidden="true">
        @for (a of card().amenities.slice(0, 3); track a.code) {
          <span appAmenityChip>{{ a.label }}</span>
        }
      </span>
    }
  `,
})
export class PrototypeVenueRow {
  /** The phone's row: the shipped card-glass skin, since the sheet's rows are its only surfaces. */
  protected readonly CARD =
    'flex items-stretch gap-3 rounded-[18px] p-2 no-underline bg-riv-card-glass border border-riv-card-border text-riv-card-ink ' +
    'shadow-[0_6px_20px_rgba(7,42,58,0.14),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[20px] ' +
    'motion-safe:[transition:background_0.15s_ease,outline-color_0.15s_ease] ' +
    'aria-[current]:outline-[3px] aria-[current]:-outline-offset-[3px] aria-[current]:outline-riv-accent-ink';
  /** The desktop's row: a list entry on the panel, a hairline under it, no card of its own (round 10). */
  protected readonly FLAT =
    'flex items-stretch gap-3 rounded-[12px] px-1.5 py-2.5 no-underline text-riv-card-ink ' +
    'motion-safe:[transition:background_0.15s_ease,outline-color_0.15s_ease] hover:bg-riv-field-fill ' +
    'aria-[current]:outline-[3px] aria-[current]:-outline-offset-[3px] aria-[current]:outline-riv-accent-ink';

  readonly card = input.required<VenueCard>();
  /** A list entry rather than a card: the desktop panel is already a surface. */
  readonly flat = input(false);
  readonly date = input.required<string>();
  readonly selected = input(false);
  /** Sales for today have closed: the row stays, faded, and says so. */
  readonly dusk = input(false);
  /** `1.8 km` from the tourist, when located. */
  readonly km = input<string | null>(null);
  /** The amenity chips under the row — off on the phone, where the row is the whole card. */
  readonly chips = input(false);
  readonly pressed = output<number>();
}
