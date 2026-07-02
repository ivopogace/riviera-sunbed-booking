import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { BookingDialog } from '../booking/booking-dialog';
import { formatMoney } from '../shared/money';
import { formatBookingDate } from '../shared/booking-date-label';
import { defaultBookingDate } from './booking-date';
import { MoneyView, SetView, VenueMapView } from './venue.model';
import { VenueService } from './venue.service';

/**
 * One rendered set on the map: the raw {@link SetView} plus its precomputed seat code
 * (`A1`, `B7`), whether it is bookable (invariant #3), and its accessible name (state
 * carried by text, not colour — WCAG AA).
 */
interface MapTile {
  readonly set: SetView;
  readonly seat: string;
  readonly bookable: boolean;
  /** Accessible name for a non-interactive tile (`<li>`). */
  readonly name: string;
  /** Accessible name for the bookable button (adds the "Select to book" affordance). */
  readonly bookName: string;
}

/** One row of the map: its derived letter code, its per-row price, and its tiles. */
interface MapRow {
  readonly code: string;
  readonly price: MoneyView;
  readonly tiles: readonly MapTile[];
}

/**
 * Derive a row's compact display code from its **insertion index** — `0→A … 25→Z, 26→AA,
 * 27→AB …` (bijective base-26, spreadsheet-column style). The map assigns these over the
 * rows in the order the API returns them (ordered `grid_y, grid_x`), so two-letter codes
 * stay in insertion order (`…Z, AA`) and are never lexicographically sorted (which would
 * wrongly place `AA` before `B`). Pure, so it is unit-tested directly.
 */
export function rowCode(index: number): string {
  let n = index;
  let code = '';
  do {
    code = String.fromCodePoint(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return code;
}

/**
 * Read-only visual beach map for one venue on a chosen day (U1, issue #4; date-aware since
 * issue #44; Liquid Glass restyle T3, issue #136). Renders the glass venue header (with
 * description + cutoff explainer), a per-date availability summary, and the positioned,
 * row-major set grid coloured by tier and availability. The map owns the selected date:
 * changing it re-fetches that date's availability and seeds the booking dialog's date, so
 * the two always agree. Money is rendered from integer minor units; tile state is conveyed
 * by an accessible name, not colour alone (WCAG AA). Big venues pan horizontally by drag;
 * a click-vs-drag threshold keeps a pan-release from opening the booking dialog.
 *
 * Display parity only: availability truth stays server-side (invariant #2); only free
 * ONLINE-pool sets are bookable (invariant #3); the picker's `min` excludes today but the
 * server remains authoritative for the real cutoff (invariant #4).
 */
@Component({
  selector: 'app-venue-map',
  imports: [BookingDialog],
  templateUrl: './venue-map.html',
  styleUrl: './venue-map.scss',
})
export class VenueMap {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly router = inject(Router);

  /** A drag that travels beyond this many pixels is a pan, not a tap. */
  private static readonly PAN_THRESHOLD_PX = 6;

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly failed = signal(false);

  /** The day the map reflects (ISO YYYY-MM-DD); defaults to tomorrow in Europe/Tirane. */
  protected readonly selectedDate = signal(defaultBookingDate(new Date()));
  /** Earliest bookable day (tomorrow, Europe/Tirane): today is not offered (invariant #4, display). */
  protected readonly minDate = defaultBookingDate(new Date());

  private readonly venueId: number | undefined;

  /** The set whose booking dialog is open, or undefined when closed. */
  protected readonly selectedSet = signal<SetView | undefined>(undefined);
  /** Id of the tile that opened the dialog, so focus can return to it on close. */
  private lastTriggerId: number | undefined;

  /** The horizontal pan viewport, present only once the map has rendered. */
  private readonly panViewport = viewChild<ElementRef<HTMLElement>>('setRowsWrap');
  /** True when the tile grid is wider than its viewport (show the drag-to-pan hint). */
  protected readonly scrollHint = signal(false);

  // --- pan gesture state (imperative; not rendered) ---
  private panPointerDown = false;
  private panStartX = 0;
  private panStartScroll = 0;
  /** Set when the current gesture crossed the drag threshold; consumed by the next select(). */
  private panned = false;

  protected readonly freeCount = computed(
    () => this.venue()?.sets.filter((s) => s.availability === 'FREE').length ?? 0,
  );
  protected readonly totalCount = computed(() => this.venue()?.sets.length ?? 0);

  /** Uniform column count so every row's grid aligns with the label/price side columns. */
  protected readonly mapCols = computed(() =>
    Math.max(1, ...this.rows().map((r) => r.tiles.length)),
  );

  /** Sets grouped into rows (read order preserved), each with a derived code + per-row price. */
  protected readonly rows = computed<readonly MapRow[]>(() => {
    const byRow = new Map<string, SetView[]>();
    for (const set of this.venue()?.sets ?? []) {
      const row = byRow.get(set.rowLabel) ?? [];
      row.push(set);
      byRow.set(set.rowLabel, row);
    }
    return [...byRow.entries()].map(([label, sets], index) => {
      const code = rowCode(index);
      return {
        code,
        price: sets[0].price,
        tiles: sets.map((set) => this.toTile(set, code, label)),
      };
    });
  });

  constructor() {
    // Re-measure the pan overflow after each render whose map data changed (jsdom reports 0,
    // so the hint's visibility is proven in the real-browser e2e, not a unit test).
    afterRenderEffect(() => {
      this.venue(); // dependency: re-run when the grid is (re)rendered
      const el = this.panViewport()?.nativeElement;
      this.scrollHint.set(!!el && el.scrollWidth > el.clientWidth + 1);
    });

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id)) {
      // Non-numeric path (e.g. /venues/abc) — fail fast instead of requesting /venues/NaN.
      this.failed.set(true);
      return;
    }
    this.venueId = id;
    this.load();
  }

  /** Build the render+a11y view of one set (invariant #3: only free ONLINE sets are bookable). */
  private toTile(set: SetView, code: string, descriptiveLabel: string): MapTile {
    const tier = set.tier === 'PREMIUM' ? 'front row' : 'standard';
    const state = set.availability === 'TAKEN' ? 'taken' : 'available';
    const seat = `${code}${set.positionNo}`;
    const bookable = set.availability === 'FREE' && set.pool === 'ONLINE';
    const name = `Set ${seat}, ${descriptiveLabel}, ${tier}, ${this.money(set.price)}, ${state}`;
    return { set, seat, bookable, name, bookName: `${name}. Select to book.` };
  }

  /** Fetch the map for the currently selected date. */
  private load(): void {
    if (this.venueId === undefined) {
      return;
    }
    // A fresh attempt clears any prior failure so a recovered load renders the map.
    this.failed.set(false);
    // Capture the requested date so a slower earlier response can't overwrite a newer one
    // (last-writer-wins across rapid date switches) — apply only if it's still the chosen date.
    const requested = this.selectedDate();
    this.venues.getVenueMap(this.venueId, requested).subscribe({
      next: (venue) => {
        if (this.selectedDate() === requested) {
          this.venue.set(venue);
        }
      },
      error: () => {
        if (this.selectedDate() === requested) {
          this.failed.set(true);
        }
      },
    });
  }

  /** Retry after a load failure: re-fetch the current date's map. */
  protected retry(): void {
    this.load();
  }

  /** Back to the discovery list. */
  protected async onBack(): Promise<void> {
    await this.router.navigate(['/']);
  }

  /** Re-fetch availability for a newly chosen date (closing any open dialog first). */
  protected onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value || value === this.selectedDate()) {
      return;
    }
    this.selectedSet.set(undefined);
    this.selectedDate.set(value);
    this.load();
  }

  // --- drag-to-pan (mouse only; touch uses native overflow scrolling) ---

  protected onMapMouseDown(event: MouseEvent): void {
    const el = this.panViewport()?.nativeElement;
    if (!el) {
      return;
    }
    this.panPointerDown = true;
    this.panned = false;
    this.panStartX = event.clientX;
    this.panStartScroll = el.scrollLeft;
  }

  protected onMapMouseMove(event: MouseEvent): void {
    const el = this.panViewport()?.nativeElement;
    if (!this.panPointerDown || !el) {
      return;
    }
    const dx = event.clientX - this.panStartX;
    if (Math.abs(dx) > VenueMap.PAN_THRESHOLD_PX) {
      this.panned = true;
    }
    el.scrollLeft = this.panStartScroll - dx;
  }

  protected onMapMouseUp(): void {
    this.panPointerDown = false;
  }

  /** The selected date rendered for display (e.g. "Tue 30 Jun 2026"). */
  protected dateLabel(): string {
    return formatBookingDate(this.selectedDate(), { withYear: true });
  }

  /** Currency formatting for the template + accessible labels (shared helper, invariant #5). */
  protected money(amount: MoneyView): string {
    return formatMoney(amount);
  }

  protected rating(venue: VenueMapView): string {
    return (venue.ratingTenths / 10).toFixed(1);
  }

  protected bookingModeLabel(mode: VenueMapView['bookingMode']): string {
    return mode === 'INSTANT' ? 'Instant Book' : 'Request to Book';
  }

  protected select(set: SetView, event?: Event): void {
    // A mouse pan-release fires a click too; swallow that one so dragging never opens the dialog.
    // Guard on `detail > 0` (a real pointer click) so a KEYBOARD activation (Enter/Space fires a
    // click with detail 0) is never swallowed — even if a prior pan ended off a tile and left the
    // flag set. Any activation clears the flag, so it can never linger past one interaction.
    const isPointerClick = ((event as MouseEvent | undefined)?.detail ?? 0) > 0;
    const suppressed = this.panned && isPointerClick;
    this.panned = false;
    if (suppressed) {
      return;
    }
    this.lastTriggerId = set.id;
    this.selectedSet.set(set);
  }

  protected onDialogClose(): void {
    this.selectedSet.set(undefined);
    // Return focus to the tile that opened the dialog (modal a11y).
    const trigger = this.lastTriggerId;
    if (trigger !== undefined) {
      queueMicrotask(() => {
        const el = document.querySelector<HTMLElement>(`[data-set-id="${trigger}"]`);
        el?.focus();
      });
    }
  }

  protected async onBooked(): Promise<void> {
    this.selectedSet.set(undefined);
    // The confirmation screen reads BookingService.lastConfirmation() (set by the POST), so no
    // navigation state is needed.
    await this.router.navigate(['/booking/confirmation']);
  }

  protected async onAwaiting(): Promise<void> {
    this.selectedSet.set(undefined);
    // The payment page reads BookingService.lastAwaitingPayment() (set by the 202 POST) to mount
    // the Stripe Payment Element; confirmation follows the verified webhook (invariant #8).
    await this.router.navigate(['/booking/pay']);
  }

  protected async onRequested(): Promise<void> {
    this.selectedSet.set(undefined);
    // The request-sent screen reads BookingService.lastRequested() (set by the 202 POST); nothing
    // is charged until the venue accepts (Request-to-Book, issue #98).
    await this.router.navigate(['/booking/requested']);
  }
}
