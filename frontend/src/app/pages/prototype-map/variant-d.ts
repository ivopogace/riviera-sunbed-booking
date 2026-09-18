/**
 * PROTOTYPE — throwaway. Variant D, "Thumb sheet" — designed at 390×844 first. The map is the
 * page; a sheet rides up from the thumb's end of the screen carrying the day, the beach and a
 * carousel with one venue always in view; the carousel and the pins are one selection. Grown to
 * desktop, the sheet unfolds into a column beside the map and the carousel becomes a list.
 */
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { beachEntry } from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { FieldGlass } from '../../shared/field-glass';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { TouchTarget } from '../../shared/touch-target';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenueCard } from '../home/venue-card';
import { VenuePreviewCard } from '../home/venue-preview-card';
import { BEACH_GROUPS, FIXTURE_PINS, cardsForDate, pinsOf } from './fixture';
import { ProtoPane, frame, readout } from './proto-pane';
import { ProtoState } from './proto-state';
import { ProtoVenueRow, revealRow } from './proto-venue-row';

/** A carousel settle eases the camera to the venue no closer than town scale. */
const FOLLOW_ZOOM = 12;

@Component({
  selector: 'app-proto-variant-d',
  imports: [
    CardGlass,
    FieldGlass,
    RivieraMap,
    TouchTarget,
    VenuePinLayer,
    VenuePreviewCard,
    ProtoPane,
    ProtoVenueRow,
  ],
  host: { class: 'block', '(keydown.escape)': 'select(null)' },
  templateUrl: './variant-d.html',
})
export class VariantD {
  private readonly state = inject(ProtoState);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild(ProtoPane);
  private readonly pinLayer = viewChild(VenuePinLayer);
  private readonly carousel = viewChild<ElementRef<HTMLElement>>('carousel');

  readonly frame = output<string>();

  protected readonly params = this.state.params;
  protected readonly date = computed(() => this.params().date);
  protected readonly beach = computed(() => this.params().beach);
  protected readonly sheet = computed(() => this.params().sheet);
  protected readonly cards = computed(() => {
    const all = cardsForDate(this.date());
    const beach = this.beach();
    return beach ? all.filter((card) => card.beach === beach) : all;
  });
  protected readonly pins = computed(() => pinsOf(this.cards()));
  protected readonly selected = computed(() => this.params().venue);
  protected readonly selectedCard = computed(
    () => this.cards().find((card) => String(card.id) === this.selected()) ?? null,
  );
  protected readonly crowdStack = computed(() => this.pinLayer()?.stack() ?? null);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  protected readonly groups = BEACH_GROUPS;
  protected readonly beachLabel = computed(() => beachEntry(this.beach())?.label ?? 'All beaches');
  /** The preview over the map opens only from a pin press, never from the carousel it duplicates. */
  protected readonly previewOpen = signal(false);

  private framed = false;
  private settling: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const handle = this.mapHandle();
      const box = this.pane()?.box();
      if (!handle || !box || box.width === 0) {
        return;
      }
      const points = FIXTURE_PINS.map((pin) => pin.at);
      if (!this.framed) {
        this.framed = true;
        frame(handle, points, box, 40, false);
      }
      this.frame.emit(readout(points, box, 40) + ` · sheet ${this.sheet()}`);
    });
    effect(() => {
      const id = this.selected();
      if (id) {
        this.reveal(id);
      }
    });
  }

  /** A pin press: select, open the preview, bring the carousel along. */
  protected onPin(id: string): void {
    this.previewOpen.set(true);
    this.state.set({ venue: id });
  }

  /** A carousel row press: select and fly there; the sheet is the preview, so none opens over the map. */
  protected onRow(id: string): void {
    this.previewOpen.set(false);
    this.state.set({ venue: id });
    this.follow(id);
  }

  protected isSelected(card: VenueCard): boolean {
    return this.selected() === String(card.id);
  }

  protected idOf(card: VenueCard): string {
    return String(card.id);
  }

  protected select(id: string | null): void {
    this.previewOpen.set(id !== null);
    this.state.set({ venue: id });
  }

  protected setSheet(sheet: 'peek' | 'half' | 'full'): void {
    this.state.set({ sheet: sheet === 'peek' ? null : sheet });
  }

  protected cycleSheet(): void {
    const next = { peek: 'half', half: 'full', full: 'peek' } as const;
    this.setSheet(next[this.sheet()]);
  }

  protected onDate(event: Event): void {
    this.state.set({ date: (event.target as HTMLInputElement).value });
  }

  protected onBeachFilter(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    this.state.set({ beach: code || null, venue: null });
    const handle = this.mapHandle();
    const box = this.pane()?.box();
    if (handle && box) {
      const points = (
        code ? FIXTURE_PINS.filter((pin) => pin.card.beach === code) : FIXTURE_PINS
      ).map((pin) => pin.at);
      frame(handle, points, box, 60, true, 14);
    }
  }

  /** The carousel settled on a row: that venue is the selection, and the camera goes to it. */
  protected onCarouselScroll(): void {
    clearTimeout(this.settling);
    this.settling = setTimeout(() => {
      const rail = this.carousel()?.nativeElement;
      if (!rail) {
        return;
      }
      const mid = rail.getBoundingClientRect().left + rail.clientWidth / 2;
      const rows = Array.from(rail.querySelectorAll<HTMLElement>('[data-venue-row]'));
      const nearest = rows.reduce<{ el: HTMLElement; d: number } | null>((best, el) => {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        return best === null || d < best.d ? { el, d } : best;
      }, null);
      const id = nearest?.el.dataset['venueRow'];
      if (id && id !== this.selected()) {
        this.previewOpen.set(false);
        this.state.set({ venue: id });
        this.follow(id);
      }
    }, 120);
  }

  private follow(id: string): void {
    const handle = this.mapHandle();
    const pin = this.pins().find((candidate) => candidate.id === id);
    if (handle && pin) {
      handle.easeTo({ center: pin.at, zoom: Math.max(handle.view().zoom, FOLLOW_ZOOM) });
    }
  }

  private reveal(id: string): void {
    afterNextRender(
      {
        write: () =>
          revealRow(
            this.host.nativeElement,
            id,
            this.sheet() === 'peek' && innerWidth < 768 ? 'x' : 'y',
          ),
      },
      { injector: this.injector },
    );
  }
}
