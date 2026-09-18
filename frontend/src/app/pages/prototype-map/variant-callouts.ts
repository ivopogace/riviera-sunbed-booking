/**
 * PROTOTYPE variant F — **Callouts**. The map is the page (round 1's B) but nothing floats over it
 * as a list: the venues are drawn ON the chart as callouts, each anchored to its spot by a leader
 * line, laid out in a column on the land side where a round 1 screenshot showed only empty inland
 * Albania. The inland waste is the label field — that is how a nautical chart labels a shoreline.
 *
 * <p>Region scale only, and that is round 1's fence finding biting: a north-up pane 1440 px wide
 * cannot frame the coast (the 2.2° fence sets a zoom floor by WIDTH), so F opens on the riviera
 * proper — Himarë — and the region rail on the left moves along the coast. The Beach select goes:
 * a beach is a place on the chart. (Built first with a whole-coast state whose callouts were the
 * regions; the screenshot showed the camera pinned to the fence's centre with the coast off it.)
 *
 * <p>Limits to judge from the screenshot: the column holds ~11 callouts at 1440 × 900 before the
 * rows shrink below a photo's worth of height (Himarë is exactly 11 in the fixture — this is where
 * it starts to bite), and below `lg` there is no land side wide enough, so the phone falls back to
 * round 1's sheet.
 */
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { beachEntry, RegionCode } from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { FieldGlass } from '../../shared/field-glass';
import { LngLat, ScreenPoint } from '../../shared/map-engine';
import { PanelGlass } from '../../shared/panel-glass';
import { SemanticChip } from '../../shared/semantic-chip';
import { TouchTarget } from '../../shared/touch-target';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenueCard } from '../home/venue-card';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { COAST } from './prototype-coast';
import { fitRotated, rawMap } from './prototype-raw-map';

/** A venue on the chart, and the card its callout draws. */
interface Anchor {
  readonly key: string;
  readonly at: LngLat;
  readonly card: VenueCard;
}

/** A laid-out callout: where its box sits, and where its leader starts. */
interface Callout extends Anchor {
  readonly pin: ScreenPoint;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

const CALLOUT_W = 272;
const CALLOUT_H = 78;
const GAP = 8;
const MARGIN = 16;
/** The map's own chrome the column clears: Near me above, the zoom column beside, the credit below. */
const CHROME_RIGHT = 60;
const CHROME_TOP = 64;
const CHROME_BOTTOM = 48;

/**
 * Stack callouts in one column on the right, in the anchors' top-to-bottom order so no two
 * leaders cross, centred on the anchors' spread and clamped to the box; rows shrink to fit when
 * there are more anchors than the height holds.
 */
function layoutCallouts(
  anchors: readonly (Anchor & { pin: ScreenPoint })[],
  width: number,
  height: number,
): readonly Callout[] {
  const sorted = [...anchors].sort((a, b) => a.pin.y - b.pin.y);
  const n = sorted.length;
  if (n === 0 || width < CALLOUT_W + CHROME_RIGHT + 2 * MARGIN) {
    return [];
  }
  const usable = height - CHROME_TOP - CHROME_BOTTOM - (n - 1) * GAP;
  const rowH = Math.max(40, Math.min(CALLOUT_H, usable / n));
  const total = n * rowH + (n - 1) * GAP;
  const mean = sorted.reduce((sum, a) => sum + a.pin.y, 0) / n;
  const start = Math.max(CHROME_TOP, Math.min(mean - total / 2, height - CHROME_BOTTOM - total));
  const x = width - MARGIN - CHROME_RIGHT - CALLOUT_W;
  return sorted.map((a, i) => ({ ...a, x, y: start + i * (rowH + GAP), height: rowH }));
}

@Component({
  selector: 'app-variant-callouts',
  imports: [RouterLink, CardGlass, FieldGlass, PanelGlass, SemanticChip, TouchTarget, RivieraMap],
  host: { class: 'block' },
  template: `
    <div #pane class="relative h-[calc(100dvh-68px)] overflow-hidden bg-riv-solid-btn-fill">
      <div class="absolute inset-0 [&>app-riviera-map]:rounded-none">
        <app-riviera-map class="size-full" [nearMe]="true" />
      </div>

      <!-- The way in: regions, north to south. Narrow, because the chart carries the rest. -->
      <nav
        appPanelGlass
        class="absolute top-4 left-4 z-[6] hidden w-[196px] rounded-[20px] p-2 lg:block"
        aria-label="The coast, north to south"
      >
        <p class="px-2 pt-1 pb-2 text-[13px] leading-[1.35] text-riv-ink-soft">
          <strong class="text-[17px] font-extrabold text-riv-accent-ink">{{
            callouts().length
          }}</strong>
          {{ callouts().length === 1 ? 'venue' : 'venues' }} on the chart
        </p>
        @for (region of coast; track region.code) {
          <button
            type="button"
            appTouchTarget
            [class]="row"
            [attr.aria-pressed]="activeRegion() === region.code"
            (click)="pickRegion(region.code)"
          >
            <span class="min-w-0 flex-1 truncate">{{ region.label }}</span>
            <span class="text-[12px] tabular-nums opacity-70">{{ region.from }}</span>
            <span
              class="rounded-full bg-riv-ink/10 px-1.5 text-[11px] font-bold tabular-nums aria-pressed:bg-white/25"
              aria-hidden="true"
              >{{ region.venues }}</span
            >
          </button>
        }
        <label class="mt-2 flex flex-col gap-1 px-1 pb-1">
          <span class="text-[11px] font-bold tracking-[0.1em] text-riv-ink-faint uppercase"
            >Date</span
          >
          <input
            appTouchTarget
            appFieldGlass
            class="w-full cursor-pointer rounded-[10px] px-2 text-[13px]"
            type="date"
            [value]="state().date"
            (change)="filtered.emit({ date: dateOf($event) })"
          />
        </label>
      </nav>

      <!-- Leaders and dots: one SVG over the map, in the solid-button pair the pins wear. -->
      <svg class="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden="true">
        @for (c of callouts(); track c.key) {
          <line
            [attr.x1]="c.pin.x"
            [attr.y1]="c.pin.y"
            [attr.x2]="c.x"
            [attr.y2]="c.y + c.height / 2"
            class="stroke-riv-solid-btn-fill"
            stroke-width="4"
            stroke-linecap="round"
          />
          <line
            [attr.x1]="c.pin.x"
            [attr.y1]="c.pin.y"
            [attr.x2]="c.x"
            [attr.y2]="c.y + c.height / 2"
            class="stroke-riv-solid-btn-ink"
            [attr.stroke-width]="lit() === c.key ? 2.5 : 1.5"
            stroke-linecap="round"
          />
          <circle
            [attr.cx]="c.pin.x"
            [attr.cy]="c.pin.y"
            [attr.r]="lit() === c.key ? 9 : 6"
            class="fill-riv-solid-btn-fill stroke-riv-solid-btn-ink"
            stroke-width="2.5"
          />
        }
      </svg>

      <!-- The callouts: each one is the venue’s card, and its link. -->
      @for (c of callouts(); track c.key) {
        <a
          appCardGlass
          class="absolute z-[6] flex items-stretch gap-2.5 overflow-hidden rounded-[16px] p-1.5 no-underline shadow-[0_10px_28px_rgba(7,42,58,0.24)] backdrop-blur-[22px] hover:bg-white/75 aria-[current]:outline-2 aria-[current]:-outline-offset-2 aria-[current]:outline-riv-accent-ink"
          [style.left.px]="c.x"
          [style.top.px]="c.y"
          [style.width.px]="calloutWidth"
          [style.height.px]="c.height"
          [routerLink]="['/venues', c.card.id]"
          [attr.aria-label]="c.card.ariaLabel"
          [attr.aria-current]="lit() === c.key ? 'true' : null"
          (mouseenter)="hovered.set(c.key)"
          (mouseleave)="hovered.set(null)"
        >
          <img
            class="aspect-square h-full shrink-0 rounded-[11px] object-cover"
            [src]="c.card.photos[0].url"
            alt=""
          />
          <span class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pr-1">
            <span class="flex items-baseline justify-between gap-2">
              <span class="truncate text-[14.5px] leading-tight font-bold text-riv-card-ink">{{
                c.card.name
              }}</span>
              <strong class="shrink-0 text-[14px] font-extrabold text-riv-accent-ink">{{
                c.card.priceLabel
              }}</strong>
            </span>
            <span class="flex items-center gap-1.5 truncate text-[12px] text-riv-card-ink-soft">
              <span class="truncate">{{ c.card.beachLabel }}</span>
              <span class="opacity-30" aria-hidden="true">·</span>
              @if (c.card.isRated) {
                <span class="text-[#f4a939]" aria-hidden="true">★</span>
                <span class="font-bold text-riv-card-ink">{{ c.card.rating }}</span>
              } @else {
                <span appSemanticChip class="px-[7px] py-px text-[10px]">New</span>
              }
              <span class="opacity-30" aria-hidden="true">·</span>
              <span class="shrink-0">{{ c.card.free }} of {{ c.card.total }} free</span>
            </span>
          </span>
        </a>
      }

      @if (state().beach) {
        <button
          type="button"
          appTouchTarget
          class="absolute top-4 left-[228px] z-[6] inline-flex items-center gap-2 rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill pr-[10px] pl-[14px] text-[14px] font-bold text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)]"
          (click)="filtered.emit({ beach: '' })"
        >
          {{ beachName() }} <span class="text-[17px] opacity-70" aria-hidden="true">×</span>
        </button>
      }
    </div>
  `,
})
export class VariantCallouts {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly row =
    'flex w-full items-center gap-2 rounded-[12px] px-2 text-left text-[13.5px] text-riv-ink-soft ' +
    'hover:bg-white/55 aria-pressed:bg-riv-accent-ink aria-pressed:font-semibold aria-pressed:text-riv-on-accent-ink';
  protected readonly coast = COAST;
  protected readonly calloutWidth = CALLOUT_W;
  private readonly map = viewChild(RivieraMap);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  private readonly pane = viewChild.required<ElementRef<HTMLElement>>('pane');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly hovered = signal<string | null>(null);
  protected readonly lit = computed(() => this.hovered());

  /** Bumped on every camera move and resize — the only thing the projection recomputes on. */
  private readonly tick = signal(0);
  private readonly box = signal({ width: 0, height: 0 });

  /** The region on the chart: the chosen one, the chosen beach's, else the riviera proper. */
  protected readonly activeRegion = computed<RegionCode>(() => {
    const { region, beach } = this.state();
    if (region !== '') {
      return region as RegionCode;
    }
    return (beach === '' ? undefined : beachEntry(beach)?.region) ?? 'HIMARE';
  });
  protected readonly beachName = computed(
    () => this.state().beaches.find((b) => b.code === this.state().beach)?.label ?? '',
  );

  /** The venues on the chart: the narrowed list, or the default region's when nothing narrows it. */
  private readonly anchors = computed<readonly Anchor[]>(() => {
    const { region, beach, pins } = this.state();
    const cards =
      region === '' && beach === ''
        ? (COAST.find((r) => r.code === this.activeRegion())?.cards ?? [])
        : pins.map((p) => p.card);
    return cards.flatMap((card) =>
      card.location
        ? [
            {
              key: String(card.id),
              at: { lng: card.location.longitude, lat: card.location.latitude },
              card,
            },
          ]
        : [],
    );
  });

  protected readonly callouts = computed<readonly Callout[]>(() => {
    const handle = this.mapHandle();
    this.tick();
    const { width, height } = this.box();
    if (handle === undefined || width < 1024) {
      return [];
    }
    return layoutCallouts(
      this.anchors().map((a) => ({ ...a, pin: handle.project(a.at) })),
      width,
      height,
    );
  });

  protected pickRegion(code: string): void {
    this.filtered.emit({ region: code, beach: '' });
  }

  protected dateOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  constructor() {
    effect((onCleanup) => {
      const handle = this.mapHandle();
      if (handle) {
        onCleanup(handle.onMove(() => this.tick.update((n) => n + 1)));
      }
    });
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        this.box.set({ width: entry.contentRect.width, height: entry.contentRect.height });
        this.tick.update((n) => n + 1);
      });
      observer.observe(this.pane().nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
    // Frame the anchors north-up, clear of the rail on the left and the column on the right.
    effect(() => {
      const handle = this.mapHandle();
      const anchors = this.anchors().map((a) => a.at);
      if (handle === undefined) {
        return;
      }
      const raw = rawMap(handle);
      if (raw !== null) {
        fitRotated(
          raw,
          anchors,
          0,
          { top: 60, bottom: 70, left: 240, right: CALLOUT_W + 60 },
          13.5,
        );
      }
    });
  }
}
