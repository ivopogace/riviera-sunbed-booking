/**
 * PROTOTYPE — throwaway. The Discover card as round 1's variant A drew it, as one element the
 * round 2 variants share: hovering it reports the venue so the map can light its pin.
 */
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AmenityChip } from '../../shared/amenity-chip';
import { CardGlass } from '../../shared/card-glass';
import { PhotoScrim } from '../../shared/photo-scrim';
import { SemanticChip } from '../../shared/semantic-chip';
import { VenueCard } from '../home/venue-card';

@Component({
  selector: 'app-prototype-venue-card',
  imports: [RouterLink, CardGlass, PhotoScrim, SemanticChip, AmenityChip],
  host: { class: 'block h-full' },
  template: `
    <a
      appCardGlass
      class="flex h-full flex-col overflow-hidden rounded-[24px] no-underline shadow-[0_10px_32px_rgba(7,42,58,0.2),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[26px] backdrop-saturate-[1.7] motion-safe:[transition:transform_0.2s_ease,box-shadow_0.2s_ease] hover:shadow-riv-card-hover motion-safe:hover:[transform:translateY(-4px)] aria-[current]:outline-[3px] aria-[current]:outline-offset-[3px] aria-[current]:outline-riv-accent-ink"
      [routerLink]="['/venues', card().id]"
      [attr.aria-label]="card().ariaLabel"
      [attr.aria-current]="selected() ? 'true' : null"
      (mouseenter)="hovered.emit(card().id)"
      (mouseleave)="hovered.emit(null)"
    >
      <span class="relative block bg-(image:--riv-photo-grad)" [class]="photoClass()">
        <img class="absolute inset-0 size-full object-cover" [src]="card().photos[0].url" alt="" />
        <span appPhotoScrim></span>
        <span appSemanticChip class="absolute top-3 left-3 px-[11px] py-[5px] text-[11px]">
          {{ card().modeLabel }}
        </span>
        <span
          class="absolute bottom-3 left-4 text-[12.5px] leading-[15px] font-semibold text-riv-photo-ink [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]"
        >
          {{ card().beachLabel }} · {{ card().regionLabel }}
        </span>
      </span>
      <span class="flex flex-1 flex-col gap-2 px-[17px] pt-4 pb-[17px]">
        <span class="text-[19px] leading-[1.08] font-bold tracking-[-0.01em] text-riv-card-ink">
          {{ card().name }}
        </span>
        <span class="flex items-center gap-[7px] text-[13px] text-riv-card-ink-soft">
          @if (card().isRated) {
            <span class="text-[#f4a939]" aria-hidden="true">★</span>
            <span class="font-bold text-riv-card-ink">{{ card().rating }}</span>
            <span class="opacity-30" aria-hidden="true">·</span>
            {{ card().reviewsLabel }}
          } @else {
            <span appSemanticChip class="px-[9px] py-px">New</span>
          }
        </span>
        <span class="flex flex-wrap gap-1.5">
          @if (card().water) {
            <span appAmenityChip water>{{ card().water }}</span>
          }
          @for (a of card().amenities.slice(0, 2); track a.code) {
            <span appAmenityChip>{{ a.label }}</span>
          }
        </span>
        <span class="mt-auto block h-1.5 overflow-hidden rounded-full bg-riv-card-track">
          <span
            class="block h-full bg-(image:--riv-bar-grad)"
            [style.width.%]="card().freePercent"
          ></span>
        </span>
        <span class="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-[13.5px] text-riv-card-ink-soft">
            from
            <strong class="text-[16px] font-extrabold text-riv-accent-ink">{{
              card().priceLabel
            }}</strong>
            / set
          </span>
          <span class="text-[12.5px] text-riv-card-ink-soft">
            {{ card().free }} of {{ card().total }} free
          </span>
        </span>
      </span>
    </a>
  `,
})
export class PrototypeVenueCard {
  readonly card = input.required<VenueCard>();
  readonly selected = input(false);
  /** A shorter photo band for a denser grid (variant E's four columns). */
  readonly photoClass = input('aspect-[3/2]');
  /** The hovered venue's id, or `null` as the pointer leaves. */
  readonly hovered = output<number | null>();
}
