/**
 * PROTOTYPE variant M — **Ledger**. Round 4's own idea, and the one that takes the aspect finding
 * to its conclusion: if no single pane can be the right shape for every result set, stop having a
 * single pane. The coast becomes a grid of **beach cards**, north to south, and each one carries a
 * small map of its own stretch at that stretch's own aspect — so every map on the page is full of
 * coast, which no single map in four rounds has managed.
 *
 * <p>It also changes what the page is a list OF. A tourist does not choose between Palasa Sands
 * and Aurora Bay first; they choose Dhërmi or Jalë or Borsh — different water, different drive,
 * different crowd — and only then a venue on it. Today's Discover makes them scan 26 venue cards
 * across sixteen beaches with no sense of which beach is which, and hides the beach in a
 * `<select>`. Here the beach is the unit, its stretch is its portrait, and its venues sit in it.
 *
 * <p>A one-venue beach has no span to fit, and the fixtures' rough operator pins are a few hundred
 * metres off the OSM shoreline — at the catalogue's beach zoom of 13 that frames open water
 * (round 3's pin-accuracy finding, met here first at the smallest scale). So a beach with nothing
 * to measure takes its own recorded camera, which already ships and is curated, opened a zoom
 * wider so the shoreline is in the card rather than under its edge.
 *
 * <p>Two costs, both measured in the README rather than argued: a live map per card is a WebGL
 * context per card and browsers keep about sixteen of those (so the cards past {@link LIVE_MAPS}
 * draw as stills, which a shipped version would do properly on an intersection observer), and the
 * tiles' licence credit is per map — sixteen maps, sixteen credits, unless the page carries one.
 */
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { beachEntry, BeachCode } from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { FieldGlass } from '../../shared/field-glass';
import { PanelGlass } from '../../shared/panel-glass';
import { SemanticChip } from '../../shared/semantic-chip';
import { TouchTarget } from '../../shared/touch-target';
import { LngLat } from '../../shared/map-engine';
import { RivieraMap } from '../../shared/riviera-map';
import { VenueCard } from '../home/venue-card';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { contentAspect } from './prototype-aspect';
import { fitPins } from './prototype-camera';

/**
 * How many cards get a live map. A WebGL context per card is the real constraint — Chrome keeps
 * about sixteen and silently loses the oldest — and sixteen beaches is already at it.
 */
const LIVE_MAPS = 9;
/** The card's map box; its height comes from the stretch, never from a constant. */
const MAP_W = 404;
const MIN_H = 132;
const MAX_H = 260;

interface Row {
  readonly code: BeachCode;
  readonly label: string;
  readonly region: string;
  readonly cards: readonly VenueCard[];
  readonly from: string;
  readonly free: number;
  readonly total: number;
  readonly at: readonly LngLat[];
  readonly height: number;
  readonly live: boolean;
}

@Component({
  selector: 'app-variant-ledger',
  imports: [RouterLink, CardGlass, FieldGlass, PanelGlass, SemanticChip, TouchTarget, RivieraMap],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[1560px] px-6 pt-5 pb-12">
      <div
        appPanelGlass
        class="mb-5 flex flex-wrap items-end gap-x-5 gap-y-3 rounded-[22px] px-4 py-3.5"
      >
        <div>
          <h1 class="text-[25px] leading-[1.05] font-bold tracking-[-0.02em] text-riv-ink">
            {{ rows().length }} beaches on {{ state().dateLabel }}.
          </h1>
          <p class="mt-0.5 text-[13.5px] text-riv-ink-soft">
            The coast north to south, {{ state().cards.length }} venues on it. Pick the beach, then
            the venue.
          </p>
        </div>
        <label class="ml-auto flex items-center gap-2 text-[12.5px] text-riv-ink-soft">
          Going on
          <input
            appTouchTarget
            appFieldGlass
            class="cursor-pointer rounded-[12px] px-3 py-2 text-[14.5px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
            type="date"
            [value]="state().date"
            (change)="filtered.emit({ date: value($event) })"
          />
        </label>
        @if (state().region !== '' || state().beach !== '') {
          <button
            type="button"
            appTouchTarget
            class="rounded-full border border-riv-field-border bg-white/70 px-4 text-[13.5px] font-bold text-riv-ink motion-safe:[transition:background_0.14s_ease] hover:bg-white"
            (click)="filtered.emit({ region: '', beach: '' })"
          >
            The whole coast
          </button>
        }
      </div>

      <ol
        class="grid list-none grid-cols-1 gap-4 md:grid-cols-2 [@media(min-width:1300px)]:grid-cols-3"
      >
        @for (row of rows(); track row.code; let i = $index) {
          <li
            appCardGlass
            class="flex flex-col overflow-hidden rounded-[24px] shadow-[0_10px_30px_rgba(7,42,58,0.16)]"
          >
            <!-- The stretch itself, at the stretch's own aspect: a bay is shallow, a cape is deep. -->
            <div
              #stretch
              class="relative shrink-0 overflow-hidden bg-riv-solid-btn-fill [&>app-riviera-map]:rounded-none [&_app-riviera-map>div.top-3]:hidden [&_app-riviera-map>p]:hidden"
              [style.height.px]="row.height"
            >
              @if (row.live) {
                <app-riviera-map class="size-full" [nearMe]="false" />
                @for (dot of dotsFor(i); track dot.id) {
                  <span
                    class="pointer-events-none absolute z-[3] size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-riv-accent-ink shadow-[0_2px_6px_rgba(7,42,58,0.45)]"
                    [style.left.px]="dot.x"
                    [style.top.px]="dot.y"
                  ></span>
                }
              } @else {
                <p
                  class="flex size-full items-center justify-center px-3 text-center text-[12px] text-riv-solid-btn-ink/60"
                >
                  {{ row.label }} draws its stretch as you reach it — nine live maps is the
                  browser's WebGL budget
                </p>
              }
              <button
                type="button"
                class="absolute inset-x-0 bottom-0 z-[4] flex items-end gap-2 bg-[linear-gradient(transparent,rgba(4,32,44,0.72))] px-3.5 pt-8 pb-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
                data-touch-exempt="prototype — the stretch's caption is the card's own heading"
                (click)="filtered.emit({ beach: row.code })"
              >
                <span class="min-w-0">
                  <span
                    class="block truncate text-[20px] leading-[1.1] font-bold tracking-[-0.015em] text-white"
                    >{{ row.label }}</span
                  >
                  <span class="block text-[12px] text-white/75">{{ row.region }}</span>
                </span>
                <span class="ml-auto shrink-0 text-right text-[12px] text-white/80">
                  from
                  <strong class="block text-[17px] leading-tight font-extrabold text-white">{{
                    row.from
                  }}</strong>
                </span>
              </button>
            </div>

            <p
              class="flex items-baseline gap-2 border-b border-riv-field-border px-3.5 py-2 text-[12.5px] text-riv-card-ink-soft"
            >
              <span>{{ row.cards.length }} {{ row.cards.length === 1 ? 'venue' : 'venues' }}</span>
              <span class="opacity-30" aria-hidden="true">·</span>
              <span
                ><strong class="text-riv-accent-ink">{{ row.free }}</strong> of {{ row.total }} sets
                free</span
              >
            </p>

            <ul class="flex list-none flex-1 flex-col">
              @for (card of row.cards; track card.id) {
                <li>
                  <a
                    class="flex items-center gap-2.5 px-3 py-2 no-underline motion-safe:[transition:background_0.15s_ease] hover:bg-white/70"
                    [routerLink]="['/venues', card.id]"
                    [attr.aria-label]="card.ariaLabel"
                  >
                    <img
                      class="size-[46px] shrink-0 rounded-[10px] object-cover"
                      [src]="card.photos[0].url"
                      alt=""
                    />
                    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        class="truncate text-[14.5px] leading-tight font-bold text-riv-card-ink"
                        >{{ card.name }}</span
                      >
                      <span class="flex items-center gap-1.5 text-[12px] text-riv-card-ink-soft">
                        @if (card.isRated) {
                          <span class="text-[#f4a939]" aria-hidden="true">★</span>
                          <span class="font-bold text-riv-card-ink">{{ card.rating }}</span>
                        } @else {
                          <span appSemanticChip class="px-[6px] py-px text-[10px]">New</span>
                        }
                        <span class="opacity-30" aria-hidden="true">·</span>
                        <span class="truncate">{{ card.water ?? card.modeLabel }}</span>
                      </span>
                    </span>
                    <span class="shrink-0 text-right">
                      <strong class="block text-[15px] font-extrabold text-riv-accent-ink">{{
                        card.priceLabel
                      }}</strong>
                      <span class="block text-[11.5px] text-riv-card-ink-soft"
                        >{{ card.free }} free</span
                      >
                    </span>
                  </a>
                </li>
              }
            </ul>
          </li>
        }
      </ol>

      <p class="mt-5 text-[12px] text-riv-ink-faint">
        Map data © <a class="underline" href="https://openmaptiles.org/">OpenMapTiles</a> ©
        <a class="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
        contributors — one credit for the page, because sixteen maps would otherwise carry sixteen.
      </p>
    </div>
  `,
})
export class VariantLedger {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  private readonly stretches = viewChildren<ElementRef<HTMLElement>>('stretch');
  private readonly maps = viewChildren(RivieraMap);
  /** Bumped by every card's camera, so all the dot overlays re-project together. */
  private readonly moved = computed(() => this.maps().map((m) => m.handle()));

  /** The set grouped by beach, in the catalogue's north-to-south order. */
  protected readonly rows = computed<readonly Row[]>(() => {
    const byBeach = new Map<string, VenueCard[]>();
    for (const card of this.state().cards) {
      const on = byBeach.get(card.beach) ?? [];
      on.push(card);
      byBeach.set(card.beach, on);
    }
    return [...byBeach.entries()].map(([code, cards], index) => {
      const at = cards.map((c) => ({ lng: c.location!.longitude, lat: c.location!.latitude }));
      // One venue is a point, not a stretch, so the catalogue's own recorded view sets the shape.
      const aspect = contentAspect(at) ?? 0.66;
      const minor = Math.min(...cards.map((c) => c.fromPrice?.minorUnits ?? Infinity));
      return {
        code: code as BeachCode,
        label: cards[0].beachLabel,
        region: cards[0].regionLabel,
        cards,
        from: `€${(minor / 100).toFixed(0)}`,
        free: cards.reduce((sum, c) => sum + c.free, 0),
        total: cards.reduce((sum, c) => sum + c.total, 0),
        at,
        height: Math.round(Math.max(MIN_H, Math.min(MAX_H, (MAP_W - 60) * aspect + 44))),
        live: index < LIVE_MAPS,
      } satisfies Row;
    });
  });

  /** Each live card projects its own pins through its own camera. */
  protected dotsFor(index: number): readonly { id: number; x: number; y: number }[] {
    const handle = this.moved()[index];
    const row = this.rows()[index];
    if (handle === undefined || row === undefined) return [];
    return row.cards.map((card) => {
      const point = handle.project({
        lng: card.location!.longitude,
        lat: card.location!.latitude,
      });
      return { id: card.id, x: point.x, y: point.y };
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  constructor() {
    afterRenderEffect(() => {
      const rows = this.rows();
      const handles = this.moved();
      const panes = this.stretches();
      handles.forEach((handle, index) => {
        const row = rows[index];
        const pane = panes[index]?.nativeElement;
        if (handle === undefined || row === undefined || pane === undefined) return;
        const entry = beachEntry(row.code);
        const view =
          row.at.length > 1
            ? fitPins(row.at, pane.clientWidth, pane.clientHeight)
            : { center: entry!.view.center, zoom: entry!.view.zoom - 1.1 };
        if (view !== null) handle.easeTo(view);
      });
    });
  }
}
