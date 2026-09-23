import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { BEACH_CATALOGUE, beachEntry, REGION_CATALOGUE } from '../../shared/beaches';
import { LocateIcon } from '../../shared/locate-icon';
import { LngLat, MapHandle } from '../../shared/map-engine';
import { PanelGlass } from '../../shared/panel-glass';
import { RivieraMap } from '../../shared/riviera-map';
import { TouchTarget } from '../../shared/touch-target';
import { fitPins } from './camera-fit';
import { lowestFromPrice } from './pin-crowding';
import { VenueCard } from './venue-card';
import { CrossIcon } from '../../shared/cross-icon';

/** A row of the coast index: a place with its venue count and its lowest from-price. */
export interface PickerPlace {
  readonly code: string;
  readonly label: string;
  readonly venues: number;
  readonly from: string | null;
}

/** A region of the index with the beaches under it, each carrying a venue. */
export interface PickerRegion extends PickerPlace {
  readonly beaches: readonly PickerPlace[];
}

/** What a pick names: a region, or a beach with its region. */
export interface PickedPlace {
  readonly region: string;
  readonly beach: string;
}

/**
 * The ribbon's width: the coast's 0.65° of longitude at the map's zoom floor is 118 px, so a
 * narrower ribbon would show inland Albania with the coast off its edge.
 */
export const RIBBON_PX = 150;
/**
 * The coast's own height over its width in Mercator (the design record's 4.51): the body asks
 * for that much height and the sheet's cap decides what it gets, so the ribbon is as tall as the
 * screen allows and the coast stands in it end to end.
 */
const COAST_ASPECT = 4.51;
/** A bare ribbon has no chrome to keep clear of; the dots are 9 px, 13 lit. */
const RIBBON_PAD_PX = 28;
/** The gutter between the ribbon and the rows, which the leaders cross and the rows' text never enters. */
const GUTTER_PX = 20;
/** The catalogue's every beach: the ribbon frames the whole coast whichever beaches have a venue. */
const COAST: readonly LngLat[] = BEACH_CATALOGUE.map((entry) => entry.view.center);

/** A 44 px row of the index; the chosen one lit as the accent pair. */
const ROW =
  'flex w-full touch-manipulation items-center gap-2 rounded-[12px] px-3 text-left text-[15px] text-riv-ink ' +
  'motion-safe:[transition:background-color_0.15s_ease,color_0.15s_ease] ' +
  'aria-[current]:bg-riv-accent-ink aria-[current]:text-riv-on-accent-ink';

/** An index beach with the place its dot marks. */
interface IndexBeach {
  readonly code: string;
  readonly region: string;
  readonly at: LngLat;
}

/** A beach's dot on the ribbon, in the ribbon's own px. */
interface Dot {
  readonly code: string;
  readonly region: string;
  readonly x: number;
  readonly y: number;
}

/** The line from a dot to its row: an SVG path in the body's px. */
interface Leader {
  readonly code: string;
  readonly region: string;
  readonly d: string;
}

interface RibbonLayout {
  readonly dots: readonly Dot[];
  readonly leaders: readonly Leader[];
}

const NOTHING: RibbonLayout = { dots: [], leaders: [] };

/**
 * The coast index, built from the cards the page already has: every region with a venue in
 * north-to-south catalogue order, its beaches under it, counts and the lowest from-price.
 */
export function coastIndex(cards: readonly VenueCard[]): readonly PickerRegion[] {
  const byBeach = new Map<string, VenueCard[]>();
  for (const card of cards) {
    const on = byBeach.get(card.beach) ?? [];
    on.push(card);
    byBeach.set(card.beach, on);
  }
  return REGION_CATALOGUE.flatMap((region) => {
    const beaches = BEACH_CATALOGUE.filter(
      (entry) => entry.region === region.code && byBeach.has(entry.code),
    ).map((entry) => {
      const on = byBeach.get(entry.code) ?? [];
      return { code: entry.code, label: entry.label, venues: on.length, from: lowestFromPrice(on) };
    });
    if (beaches.length === 0) {
      return [];
    }
    const on = beaches.flatMap((beach) => byBeach.get(beach.code) ?? []);
    return [
      {
        code: region.code,
        label: region.label,
        venues: on.length,
        from: lowestFromPrice(on),
        beaches,
      },
    ];
  });
}

/**
 * The coast picker: the whole coast as a CHOOSER, never as the page. A sheet with a 150 px map
 * ribbon down its left edge — the whole coast fitted tall, one dot per beach of the index — and
 * beside it the coast index: every region and every beach that has a venue, its count and its
 * from-price, as 44 px rows, each beach row tied to its dot by a leader, Near me at the head.
 * There is no `Whole coast`, because the coast is not a state on any screen: a region is the
 * widest frame a phone can hold. From `lg` the same panel is a popover under the anchor it is
 * mounted in.
 *
 * <p>The ribbon is a second riviera map, so a second WebGL context: it exists exactly as long as
 * this component does, which is why the `@if` stays outside it — created with the choice,
 * destroyed with it (and that is also what lets it take focus on the way in, WCAG 2.4.3; focus
 * back out is the caller's, via `focusMover()`). The ribbon is a picture: `aria-hidden`, no
 * pointer, the index beside it is the accessible structure. The dots and the leaders are this
 * component's own overlay, projected through the map's handle as the pin layer's are, and re-laid
 * whenever the rows scroll, the box resizes or the camera moves.
 */
@Component({
  selector: 'app-coast-picker',
  imports: [LocateIcon, NgTemplateOutlet, PanelGlass, RivieraMap, TouchTarget, CrossIcon],
  host: {
    class: 'contents',
    '(keydown.escape)': 'closed.emit()',
  },
  template: `
    <div
      data-testid="picker-backdrop"
      class="fixed inset-0 z-[30] bg-riv-ink/35 backdrop-blur-[2px] lg:bg-transparent lg:backdrop-blur-none"
      aria-hidden="true"
      (click)="closed.emit()"
    ></div>
    <div
      #panel
      appPanelGlass
      data-testid="coast-picker"
      role="dialog"
      aria-label="Choose a place on the coast"
      tabindex="-1"
      class="fixed inset-x-0 bottom-0 z-[31] flex max-h-[86dvh] flex-col rounded-t-[26px] shadow-[0_-16px_50px_rgba(7,42,58,0.35)] lg:absolute lg:inset-x-auto lg:top-[calc(100%+8px)] lg:bottom-auto lg:left-0 lg:h-[min(760px,calc(100dvh-140px))] lg:w-[420px] lg:rounded-[22px]"
    >
      <div class="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
        <h2 class="text-[17px] font-bold text-riv-ink">The coast, north to south</h2>
        <button
          type="button"
          appTouchTarget
          data-testid="picker-close"
          class="ml-auto -mr-2 inline-flex touch-manipulation items-center justify-center rounded-full text-riv-ink-soft [&_svg]:size-[14px] hover:text-riv-ink"
          aria-label="Close"
          (click)="closed.emit()"
        >
          <app-cross-icon />
        </button>
      </div>
      <div class="flex shrink-0 px-3 pb-2">
        <button
          type="button"
          appTouchTarget
          data-testid="picker-near-me"
          class="inline-flex flex-1 touch-manipulation items-center justify-center gap-2 rounded-full bg-riv-accent-ink px-4 text-[14px] font-semibold text-riv-on-accent-ink"
          [attr.aria-pressed]="located()"
          (click)="nearMe.emit()"
        >
          <app-locate-icon />Near me
        </button>
      </div>
      <!-- The body asks for the coast's height (150 × 4.51); the sheet's cap shrinks it, never the ribbon's width. -->
      <div
        #body
        class="relative flex min-h-0 shrink"
        [style.flex-basis.px]="RIBBON_PX * COAST_ASPECT"
      >
        <div
          #ribbon
          data-testid="picker-ribbon"
          aria-hidden="true"
          class="pointer-events-none relative w-[150px] shrink-0 self-stretch overflow-hidden rounded-r-[14px] bg-riv-solid-btn-fill"
        >
          <app-riviera-map class="size-full" [ribbon]="true" />
          <!-- The dot is the you-are-here dot's fixed pair and lights by INVERTING it, as a selected pin does: it sits on imagery, which never themes, so the accent would drift (riviera-map.contrast.spec proves both faces). -->
          @for (dot of dots(); track dot.code) {
            <span
              data-testid="ribbon-dot"
              [attr.data-beach]="dot.code"
              [attr.data-lit]="dot.lit ? '' : null"
              class="absolute z-[4] size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-riv-solid-btn-fill bg-riv-solid-btn-ink shadow-[0_2px_6px_rgba(7,42,58,0.45)] motion-safe:[transition:width_0.12s_ease,height_0.12s_ease] data-lit:size-[13px] data-lit:border-riv-solid-btn-ink data-lit:bg-riv-solid-btn-fill"
              [style.left.px]="dot.x"
              [style.top.px]="dot.y"
            ></span>
          }
        </div>
        <ul
          data-testid="picker-index"
          class="min-h-0 min-w-0 flex-1 self-stretch overflow-y-auto overscroll-contain pr-3 pb-[max(12px,env(safe-area-inset-bottom))] pl-5 scrollbar-thin"
          (scroll)="relayout()"
        >
          @for (region of regions(); track region.code) {
            <li>
              <button
                type="button"
                appTouchTarget
                data-testid="picker-row"
                [class]="ROW + ' font-bold'"
                [attr.aria-current]="
                  beach() === '' && region.code === this.region() ? 'true' : null
                "
                (pointerenter)="warm('region', region.code)"
                (pointerdown)="warm('region', region.code)"
                (focus)="warm('region', region.code)"
                (pointerleave)="cool()"
                (blur)="cool()"
                (click)="picked.emit({ region: region.code, beach: '' })"
              >
                <ng-container *ngTemplateOutlet="row; context: { $implicit: region }" />
              </button>
              <ul class="pl-4">
                @for (place of region.beaches; track place.code) {
                  <li>
                    <button
                      type="button"
                      appTouchTarget
                      data-testid="picker-row"
                      [attr.data-beach-row]="place.code"
                      [class]="ROW"
                      [attr.aria-current]="beach() === place.code ? 'true' : null"
                      (pointerenter)="warm('beach', place.code)"
                      (pointerdown)="warm('beach', place.code)"
                      (focus)="warm('beach', place.code)"
                      (pointerleave)="cool()"
                      (blur)="cool()"
                      (click)="picked.emit({ region: region.code, beach: place.code })"
                    >
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: place }" />
                    </button>
                  </li>
                }
              </ul>
            </li>
          }
        </ul>
        <svg
          data-testid="picker-leaders"
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 left-0 z-[3] overflow-visible"
          [attr.width]="RIBBON_PX + GUTTER_PX"
        >
          @for (leader of leaders(); track leader.code) {
            <path
              data-testid="ribbon-leader"
              [attr.data-beach]="leader.code"
              [attr.data-lit]="leader.lit ? '' : null"
              [attr.d]="leader.d"
              class="fill-none stroke-riv-solid-btn-ink/40 stroke-[1.5] data-lit:stroke-riv-solid-btn-ink data-lit:stroke-2"
            />
          }
        </svg>
      </div>
    </div>

    <ng-template #row let-place>
      <span class="min-w-0 flex-1 truncate">{{ place.label }}</span
      >&ngsp;<span class="shrink-0 text-[13px] opacity-80"
        >{{ place.venues }} {{ place.venues === 1 ? 'venue' : 'venues' }}</span
      >
      @if (place.from; as from) {
        &ngsp;<span class="shrink-0 text-[13px] font-semibold">from {{ from }}</span>
      }
    </ng-template>
  `,
})
export class CoastPicker {
  private readonly destroyRef = inject(DestroyRef);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly ribbon = viewChild.required<ElementRef<HTMLElement>>('ribbon');
  private readonly map = viewChild.required(RivieraMap);

  protected readonly ROW = ROW;
  protected readonly RIBBON_PX = RIBBON_PX;
  protected readonly COAST_ASPECT = COAST_ASPECT;
  protected readonly GUTTER_PX = GUTTER_PX;

  /** The coast index, from {@link coastIndex}. */
  readonly regions = input.required<readonly PickerRegion[]>();
  /** The focused region's code. */
  readonly region = input('');
  /** The chosen beach's code, `''` for the region. */
  readonly beach = input('');
  /** The tourist is placed: Near me is lit. */
  readonly located = input(false);

  readonly picked = output<PickedPlace>();
  readonly nearMe = output<void>();
  readonly closed = output<void>();

  /**
   * The row under the pointer, holding focus or being pressed, as `kind:code` — a region and a
   * beach can share a code (Durrës, Himarë, Vlorë, Sarandë), and only the region lights every
   * dot under it.
   */
  private readonly hot = signal<string | null>(null);
  private readonly layout = signal<RibbonLayout>(NOTHING);

  /** The index's beaches with the catalogue place each dot marks; one off the catalogue has none. */
  private readonly beaches = computed<readonly IndexBeach[]>(() =>
    this.regions().flatMap((region) =>
      region.beaches.flatMap((place) => {
        const entry = beachEntry(place.code);
        return entry === undefined
          ? []
          : [{ code: place.code, region: region.code, at: entry.view.center }];
      }),
    ),
  );

  protected readonly dots = computed(() => {
    const hot = this.hot();
    return this.layout().dots.map((dot) => ({ ...dot, lit: isLit(dot, hot) }));
  });

  protected readonly leaders = computed(() => {
    const hot = this.hot();
    return this.layout().leaders.map((leader) => ({ ...leader, lit: isLit(leader, hot) }));
  });

  constructor() {
    afterNextRender({ write: () => this.panel().nativeElement.focus() });
    effect((onCleanup) => {
      const handle = this.map().handle();
      if (handle === undefined) {
        return;
      }
      onCleanup(handle.onMove(() => this.relayout()));
      untracked(() => this.fit(handle));
    });
    // The rows are laid out by now, so their boxes can be read; a signal write here is one more render.
    afterRenderEffect(() => {
      this.regions();
      this.map().handle();
      untracked(() => this.relayout());
    });
    afterNextRender(() => this.watchSize());
  }

  protected warm(kind: 'region' | 'beach', code: string): void {
    this.hot.set(`${kind}:${code}`);
  }

  protected cool(): void {
    this.hot.set(null);
  }

  /** The whole coast, end to end, in whatever box the ribbon has; a box with no size waits. */
  private fit(handle: MapHandle): void {
    const { clientWidth, clientHeight } = this.ribbon().nativeElement;
    const view = fitPins(COAST, clientWidth, clientHeight, undefined, RIBBON_PAD_PX);
    if (view !== null) {
      handle.setView(view);
    }
  }

  /**
   * Every dot where its beach projects through the ribbon's camera, and a leader from each dot
   * to its row's middle — skipped for a dot outside the ribbon and for a row scrolled out of the
   * body, so no line reaches for something that is not on screen.
   */
  protected relayout(): void {
    const handle = this.map().handle();
    if (handle === undefined) {
      this.layout.set(NOTHING);
      return;
    }
    const body = this.body().nativeElement;
    const box = body.getBoundingClientRect();
    const dots = this.beaches().map(({ code, region, at }) => {
      const { x, y } = handle.project(at);
      return { code, region, x, y };
    });
    const rows = new Map<string, DOMRect>();
    for (const row of body.querySelectorAll<HTMLElement>('[data-beach-row]')) {
      rows.set(row.dataset['beachRow']!, row.getBoundingClientRect());
    }
    // A body with no box yet (a document that lays nothing out) clips nothing.
    const offBody = (y: number) => box.height > 0 && (y < 0 || y > box.height);
    const leaders = dots.flatMap((dot) => {
      const row = rows.get(dot.code);
      if (row === undefined || offBody(dot.y)) {
        return [];
      }
      const rowY = row.top + row.height / 2 - box.top;
      return offBody(rowY)
        ? []
        : [{ code: dot.code, region: dot.region, d: leaderPath(dot, rowY) }];
    });
    this.layout.set({ dots, leaders });
  }

  /** A resized ribbon refits the coast and re-projects every dot, and no engine reports that as a move. */
  private watchSize(): void {
    if (typeof ResizeObserver !== 'function') {
      return;
    }
    const observer = new ResizeObserver(() => {
      const handle = this.map().handle();
      if (handle !== undefined) {
        this.fit(handle);
      }
      this.relayout();
    });
    observer.observe(this.ribbon().nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}

function isLit({ code, region }: { code: string; region: string }, hot: string | null): boolean {
  return hot === `beach:${code}` || hot === `region:${region}`;
}

/**
 * From the dot's edge straight to the ribbon's edge, across the gutter to the row's middle, and a
 * short landing before the row's text — which starts past the gutter and is never crossed.
 */
function leaderPath(dot: Dot, rowY: number): string {
  return (
    `M ${round(dot.x + 5)} ${round(dot.y)} H ${RIBBON_PX - 6} ` +
    `L ${RIBBON_PX + 8} ${round(rowY)} H ${RIBBON_PX + 16}`
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
