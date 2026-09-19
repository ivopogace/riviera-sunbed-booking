/**
 * PROTOTYPE — throwaway. The coast picker: the whole coast as a CHOOSER, not as the page.
 *
 * <p>The whole coast cannot be framed on a 390 px phone inside a scroll column (the ADR-0022
 * fence plus `minZoom: 7`), and the one phone screen on which all sixteen beaches are legible at
 * once is a narrow ribbon alone, full-height. So the ribbon is the thing a phone opens ON DEMAND
 * to choose a place: a sheet with the coast as a 150 px ribbon down its left edge and, beside it,
 * the coast index as 44 px rows — every region and every beach that has a venue, its count and
 * its from-price — each row tied to its dot by a leader. Near me heads the list; Whole coast joins it from `lg`,
 * because the coast is not a phone state (a region is the phone's widest frame).
 * The ribbon's WebGL context exists only while the sheet is open, which is the cost a first
 * screen on 4G should not carry.
 *
 * <p>From `lg` up the same element is a popover under the place button, so the desktop picks a
 * place the same way the phone does.
 */
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { LngLat } from '../../shared/map-engine';
import { PanelGlass } from '../../shared/panel-glass';
import { RivieraMap } from '../../shared/riviera-map';
import { TouchTarget } from '../../shared/touch-target';
import { fitPins } from './prototype-camera';
import { COAST } from './prototype-coast';
import { PrototypeFilter } from './prototype-map-page';
import { PROTOTYPE_VENUES } from './prototype-venues';

/**
 * The ribbon's width: the coast's 0.6° of longitude at the fence floor (zoom 7) is 109 px, so a
 * narrower ribbon shows inland Albania with the coast off its edge — measured, the first cut at
 * 96 px did exactly that.
 */
const RIBBON = 150;
/** A bare ribbon has no chrome to keep clear of; the dots are 9 px. */
const RIBBON_PAD = 28;
/** Every row is a 44 px control (WCAG 2.5.5), so the index's height is the row count times this. */
const ROW = 44;

interface IndexRow {
  readonly kind: 'region' | 'beach';
  readonly code: string;
  readonly label: string;
  readonly venues: number;
  readonly from: string;
  readonly at: LngLat;
  /** The row's y in the scrolling body, so the ribbon's leader can reach it. */
  readonly y: number;
}

@Component({
  selector: 'app-prototype-coast-picker',
  imports: [PanelGlass, RivieraMap, TouchTarget],
  host: { class: 'contents' },
  template: `
    <div
      class="fixed inset-0 z-[30] bg-riv-ink/35 backdrop-blur-[2px] lg:bg-transparent lg:backdrop-blur-none"
      aria-hidden="true"
      (click)="closed.emit()"
    ></div>
    <div
      appPanelGlass
      class="fixed inset-x-0 bottom-0 z-[31] flex max-h-[86dvh] flex-col rounded-t-[26px] shadow-[0_-16px_50px_rgba(7,42,58,0.35)] lg:absolute lg:inset-x-auto lg:top-[calc(100%+8px)] lg:bottom-auto lg:left-0 lg:h-[min(760px,calc(100dvh-140px))] lg:w-[420px] lg:rounded-[22px]"
      role="dialog"
      aria-label="Choose a place on the coast"
    >
      <div class="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
        <h2 class="text-[17px] font-bold text-riv-ink">The coast, north to south</h2>
        <button
          type="button"
          appTouchTarget
          class="ml-auto -mr-2 inline-flex items-center justify-center rounded-full text-[22px] leading-none text-riv-ink-soft hover:text-riv-ink"
          aria-label="Close"
          (click)="closed.emit()"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div class="flex shrink-0 gap-2 px-3 pb-2">
        <button
          type="button"
          appTouchTarget
          class="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-riv-accent-ink px-4 text-[14px] font-semibold text-riv-on-accent-ink"
          (click)="nearMe.emit()"
        >
          <span aria-hidden="true">◎</span> Near me
        </button>
        <button
          type="button"
          appTouchTarget
          class="hidden flex-1 items-center justify-center rounded-full border border-riv-field-border bg-riv-field-fill px-4 text-[14px] font-semibold text-riv-ink"
          [class.lg:inline-flex]="wholeCoast()"
          [class.bg-riv-accent-ink]="region() === '' && beach() === '' && !located()"
          [class.text-riv-on-accent-ink]="region() === '' && beach() === '' && !located()"
          (click)="pick({ region: '', beach: '', here: null })"
        >
          Whole coast
        </button>
      </div>

      <!-- One scroll body for ribbon and rows, so a leader never has to cross a scroll seam. -->
      <div class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
        <div class="relative flex" [style.height.px]="rows().length * ROW + 16">
          <div
            #ribbon
            class="sticky top-0 shrink-0 self-start overflow-hidden rounded-r-[14px] bg-riv-solid-btn-fill [&>app-riviera-map]:rounded-none [&_app-riviera-map>div.top-3]:hidden [&_app-riviera-map>p]:hidden"
            [style.width.px]="RIBBON"
            [style.height.px]="ribbonHeight()"
          >
            <app-riviera-map class="size-full" [nearMe]="false" />
            @for (dot of dots(); track dot.code) {
              <span
                class="pointer-events-none absolute z-[4] size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-riv-accent-ink shadow-[0_2px_6px_rgba(7,42,58,0.45)]"
                [style.left.px]="dot.x"
                [style.top.px]="dot.y"
              ></span>
            }
          </div>
          <svg
            class="pointer-events-none absolute top-0 left-0 z-[3]"
            aria-hidden="true"
            [attr.viewBox]="'0 0 ' + (RIBBON + 40) + ' ' + (rows().length * ROW + 16)"
            [attr.width]="RIBBON + 40"
            [attr.height]="rows().length * ROW + 16"
          >
            @for (dot of dots(); track dot.code) {
              <path
                class="fill-none stroke-riv-accent-ink/35"
                stroke-width="1.5"
                [attr.d]="
                  'M ' +
                  (dot.x + 5) +
                  ' ' +
                  dot.y +
                  ' H ' +
                  (RIBBON - 6) +
                  ' L ' +
                  (RIBBON + 8) +
                  ' ' +
                  dot.rowY +
                  ' H ' +
                  (RIBBON + 16)
                "
              />
            }
          </svg>
          <ol class="min-w-0 flex-1 list-none pt-2 pr-3 pl-5">
            @for (row of rows(); track row.kind + row.code) {
              <li>
                <button
                  type="button"
                  appTouchTarget
                  class="flex w-full items-center gap-2 rounded-[12px] px-2 text-left hover:bg-white/60 aria-[current]:bg-riv-accent-ink aria-[current]:text-riv-on-accent-ink"
                  [class]="row.kind === 'region' ? 'mt-1' : 'pl-5'"
                  [attr.aria-current]="current(row) ? 'true' : null"
                  (click)="
                    pick(
                      row.kind === 'region'
                        ? { region: row.code, here: null }
                        : { beach: row.code, here: null }
                    )
                  "
                >
                  <span
                    class="truncate"
                    [class]="
                      row.kind === 'region' ? 'text-[15px] font-bold' : 'text-[14px] font-semibold'
                    "
                    >{{ row.label }}</span
                  >
                  <span class="ml-auto shrink-0 text-[13px] opacity-80">{{ row.from }}</span>
                  <span
                    class="inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-riv-accent-ink px-1.5 text-[11.5px] font-bold text-white"
                    [class.bg-white]="current(row)"
                    [class.text-riv-accent-ink]="current(row)"
                    >{{ row.venues }}</span
                  >
                </button>
              </li>
            }
          </ol>
        </div>
      </div>
    </div>
  `,
})
export class PrototypeCoastPicker {
  readonly region = input.required<string>();
  readonly beach = input.required<string>();
  readonly located = input(false);
  /** Whether the coast itself is a state the desktop can show; round 8's line desk says no. */
  readonly wholeCoast = input(true);
  readonly picked = output<PrototypeFilter>();
  readonly nearMe = output<void>();
  readonly closed = output<void>();

  protected readonly RIBBON = RIBBON;
  protected readonly ROW = ROW;

  private readonly map = viewChild(RivieraMap);
  private readonly ribbon = viewChild.required<ElementRef<HTMLElement>>('ribbon');
  private readonly moved = signal(0);

  /** Regions as header rows, their beaches under them; y is the row's centre in the body. */
  protected readonly rows = computed<readonly IndexRow[]>(() => {
    const out: IndexRow[] = [];
    for (const region of COAST) {
      out.push({
        kind: 'region',
        code: region.code,
        label: region.label,
        venues: region.venues,
        from: region.from,
        at: centre(region.cards.map((c) => c.location!)),
        y: 8 + out.length * ROW + ROW / 2 + 4,
      });
      for (const b of region.beaches) {
        const on = PROTOTYPE_VENUES.filter((v) => v.beach === b.code);
        out.push({
          kind: 'beach',
          code: b.code,
          label: b.label,
          venues: b.venues,
          from: b.from,
          at: centre(on.map((c) => c.location!)),
          y: 8 + out.length * ROW + ROW / 2 + 4,
        });
      }
    }
    return out;
  });

  /** The ribbon is as tall as the body it sits in, capped at the sheet's own height. */
  protected readonly ribbonHeight = computed(() => Math.min(this.rows().length * ROW + 16, 1200));

  /** One dot per beach, projected through the ribbon's camera, with its row's y for the leader. */
  protected readonly dots = computed(() => {
    this.moved();
    const handle = this.map()?.handle();
    if (handle === undefined) return [];
    return this.rows()
      .filter((row) => row.kind === 'beach')
      .map((row) => {
        const p = handle.project(row.at);
        return { code: row.code, x: p.x, y: p.y, rowY: row.y };
      });
  });

  protected current(row: IndexRow): boolean {
    return row.kind === 'region' ? this.region() === row.code : this.beach() === row.code;
  }

  protected pick(change: PrototypeFilter): void {
    this.picked.emit(change);
    this.closed.emit();
  }

  constructor() {
    let watching = false;
    afterRenderEffect(() => {
      const handle = this.map()?.handle();
      const pane = this.ribbon().nativeElement;
      this.ribbonHeight();
      if (handle === undefined) return;
      if (!watching) {
        handle.onMove(() => this.moved.update((n) => n + 1));
        watching = true;
      }
      const view = fitPins(
        PROTOTYPE_VENUES.map((v) => ({ lng: v.location!.longitude, lat: v.location!.latitude })),
        pane.clientWidth,
        pane.clientHeight,
        0,
        0,
        RIBBON_PAD,
      );
      if (view !== null) handle.easeTo(view);
    });
  }
}

function centre(at: readonly { latitude: number; longitude: number }[]): LngLat {
  return {
    lng: at.reduce((s, p) => s + p.longitude, 0) / at.length,
    lat: at.reduce((s, p) => s + p.latitude, 0) / at.length,
  };
}
