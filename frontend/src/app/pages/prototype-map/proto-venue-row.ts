/**
 * PROTOTYPE — throwaway. The compact venue row two variants share: A's shelf and D's carousel and
 * list. A photo mass, the name, where it is, the from-price and the sets free — the list card's
 * facts at a third of its height, so a row and the map fit one screen together.
 */
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../../shared/card-glass';
import { PhotoScrim } from '../../shared/photo-scrim';
import { PhotoSlideshow } from '../../shared/photo-slideshow';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from '../home/venue-card';

/** Scroll a row into a rail's centre on the rail's own axis only — `scrollIntoView` would also move the window. */
export function revealRow(host: HTMLElement, id: string, axis: 'x' | 'y'): void {
  const row = host.querySelector<HTMLElement>(`[data-venue-row="${id}"]`);
  const rail = row?.closest<HTMLElement>('[data-rail]');
  if (!row || !rail) {
    return;
  }
  if (axis === 'x') {
    rail.scrollTo({
      left: row.offsetLeft - (rail.clientWidth - row.offsetWidth) / 2,
      behavior: 'smooth',
    });
  } else {
    rail.scrollTo({
      top: row.offsetTop - (rail.clientHeight - row.offsetHeight) / 2,
      behavior: 'smooth',
    });
  }
}

@Component({
  selector: 'app-proto-venue-row',
  imports: [RouterLink, CardGlass, PhotoScrim, PhotoSlideshow, SemanticChip, SetsFree, TouchTarget],
  host: { class: 'block' },
  template: `
    <article
      appCardGlass
      class="relative flex overflow-hidden rounded-[18px] shadow-[0_10px_30px_rgba(7,42,58,0.18)] backdrop-blur-[22px] backdrop-saturate-[1.7] [&[data-selected]]:outline-[3px] [&[data-selected]]:outline-offset-2 [&[data-selected]]:outline-riv-accent-ink"
      [class]="card().salesClosed || card().closedForSeason ? 'opacity-80' : ''"
      [attr.data-selected]="selected() ? '' : null"
      [attr.data-venue-row]="card().id"
    >
      <span
        class="relative block w-[96px] shrink-0 self-stretch bg-(image:--riv-photo-grad)"
        aria-hidden="true"
      >
        <app-photo-slideshow [photos]="cover()" [name]="card().name" testId="row-photo" />
        @if (cover().length === 0) {
          <span
            class="absolute top-1/2 left-1/2 size-[28px] rounded-[50%] bg-(image:--riv-sun-grad) shadow-[0_0_16px_6px_rgba(255,199,105,0.4)] [transform:translate(-50%,-50%)]"
          ></span>
        }
        <span appPhotoScrim></span>
      </span>
      <button
        type="button"
        appTouchTarget
        class="flex min-w-0 flex-1 cursor-pointer flex-col gap-[3px] px-[12px] py-[10px] text-left"
        [attr.aria-pressed]="selected()"
        [attr.aria-label]="card().ariaLabel"
        (click)="choose()"
      >
        <span class="flex items-baseline justify-between gap-2">
          <span class="truncate text-[15.5px] leading-[1.15] font-bold text-riv-card-ink">{{
            card().name
          }}</span>
          @if (card().priceLabel; as price) {
            <span class="shrink-0 text-[14px] font-extrabold text-riv-accent-ink tabular-nums">{{
              price
            }}</span>
          }
        </span>
        <span class="truncate text-[12px] text-riv-card-ink-soft"
          >{{ card().beachLabel }} · {{ card().regionLabel }}</span
        >
        <span class="mt-[2px] flex items-center gap-[8px] text-[12px] text-riv-card-ink-soft">
          @if (card().isRated) {
            <span
              ><span class="text-[#f4a939]" aria-hidden="true">★</span> {{ card().rating }}</span
            >
          } @else {
            <span appSemanticChip class="px-[8px] py-px text-[10.5px]">New</span>
          }
          <span><app-sets-free [free]="card().free" [total]="card().total" /></span>
          @if (card().salesClosed) {
            <span class="font-semibold text-riv-card-ink">closed today</span>
          }
        </span>
      </button>
      <a
        appTouchTarget
        class="absolute right-[8px] bottom-[6px] inline-flex items-center rounded-full px-[10px] text-[12px] font-semibold text-riv-accent-ink no-underline"
        [routerLink]="['/venues', card().id]"
        [queryParams]="{ date: date() }"
        [attr.aria-label]="'View beach map for ' + card().name"
        >Beach map ›</a
      >
    </article>
  `,
})
export class ProtoVenueRow {
  readonly card = input.required<VenueCard>();
  readonly date = input.required<string>();
  readonly selected = input(false);
  readonly chosen = output<string>();

  protected readonly cover = computed(() => this.card().photos.slice(0, 1));

  protected choose(): void {
    this.chosen.emit(String(this.card().id));
  }
}
