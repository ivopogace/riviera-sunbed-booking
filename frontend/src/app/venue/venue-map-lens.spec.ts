import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { BookingDialog } from '../booking/booking-dialog';
import { BookingConfirmation } from '../booking/booking.model';
import { ProofOfWork } from '../core/proof-of-work';
import { addDays, defaultBookingDate } from '../shared/booking-date';
import { BELOW_SM } from '../shared/phone-viewport';
import { ItineraryView, SetView, VenueMapView } from '../shared/venue-views';
import { PartlyFreeSheet } from './partly-free-sheet';
import { VenueMap } from './venue-map';

/**
 * The tourist beach map below `sm` (#1762): the row lens in place of the canvas, and the pick. The
 * viewport is a stubbed `matchMedia`; `venue-map.spec.ts` covers `sm` up, where jsdom has none.
 *
 * Row A is 6 wide (front row, €45), B and C 3 wide and one zone (€35), D a walk-in row (€25).
 */
type Cell = 'free' | 'taken';

function beach(rowA: readonly Cell[] = ['taken', 'free', 'free', 'free', 'free', 'free']) {
  const rows: readonly {
    label: string;
    tier: SetView['tier'];
    pool: SetView['pool'];
    price: number;
    cells: readonly Cell[];
  }[] = [
    { label: 'A', tier: 'PREMIUM', pool: 'ONLINE', price: 4500, cells: rowA },
    { label: 'B', tier: 'STANDARD', pool: 'ONLINE', price: 3500, cells: ['free', 'taken', 'free'] },
    {
      label: 'C',
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: 3500,
      cells: ['taken', 'taken', 'taken'],
    },
    { label: 'D', tier: 'STANDARD', pool: 'WALK_IN', price: 2500, cells: ['free', 'free'] },
  ];
  let id = 0;
  const sets: SetView[] = rows.flatMap((row, r) =>
    row.cells.map((cell, i) => ({
      id: ++id,
      rowLabel: row.label,
      positionNo: i + 1,
      tier: row.tier,
      pool: row.pool,
      price: { minorUnits: row.price, currency: 'EUR' },
      gridX: i + 1,
      gridY: r + 1,
      availability: cell === 'taken' ? 'TAKEN' : 'FREE',
    })),
  );
  const venue: VenueMapView = {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'KSAMIL',
    region: 'SARANDE',
    description: '',
    ratingTenths: 48,
    reviewsCount: 3,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3500, currency: 'EUR' },
    sets,
  };
  return venue;
}

class FakeProofOfWork {
  readonly enabled = signal<boolean | undefined>(false);
}

describe('VenueMap on a phone: the row lens (#1762)', () => {
  let fixture: ComponentFixture<VenueMap>;
  let httpMock: HttpTestingController;
  let queryParams$: BehaviorSubject<ParamMap>;
  let queries: string[];

  async function mount(query: Record<string, string> = {}, phone = true): Promise<void> {
    queries = [];
    vi.stubGlobal('matchMedia', (media: string) => {
      queries.push(media);
      return { matches: phone, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    });
    const params$ = new BehaviorSubject(convertToParamMap({ id: '1' }));
    queryParams$ = new BehaviorSubject(convertToParamMap(query));
    await TestBed.configureTestingModule({
      imports: [VenueMap],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProofOfWork, useValue: new FakeProofOfWork() },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: params$.value, queryParamMap: queryParams$.value },
            paramMap: params$,
            queryParamMap: queryParams$,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VenueMap);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.match((req) => req.url.endsWith('/reviews'));
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    httpMock
      .match((req) => req.url.includes('/api/bookings/cancellation-terms'))
      .forEach((req) =>
        req.flush({
          window: 'FREE',
          freeCancellationEndsAt: '2026-06-14T16:00:00Z',
          lateCancelRefundBps: 0,
        }),
      );
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function venueReq(): TestRequest {
    return httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues/1`);
  }

  async function load(venue: VenueMapView = beach()): Promise<void> {
    await mount();
    fixture.detectChanges();
    venueReq().flush(venue);
    await settle();
  }

  const dom = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const all = (testid: string): HTMLElement[] => [
    ...dom().querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`),
  ];
  const one = (testid: string): HTMLElement | null =>
    dom().querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  const rowButton = (code: string): HTMLElement =>
    all('lens-row').find((el) => el.dataset['lensRow'] === code)!;
  const openCodes = (): (string | undefined)[] =>
    all('lens-open').map((el) => el.dataset['lensOpen']);
  const tile = (setId: number): HTMLButtonElement =>
    dom().querySelector<HTMLButtonElement>(`button[data-set-id="${setId}"]`)!;
  const cellStates = (code: string): (string | undefined)[] =>
    [...rowButton(code).querySelectorAll<HTMLElement>('[data-testid="lens-cell"]')].map(
      (cell) => cell.dataset['state'],
    );

  async function tap(target: HTMLElement): Promise<void> {
    target.click();
    await settle();
  }

  describe('the layout', () => {
    it('asks for Tailwind’s own sm boundary and mounts the lens, not the canvas', async () => {
      await load();

      expect(queries).toContain(BELOW_SM);
      expect(BELOW_SM).toBe('(width < 40rem)');
      expect(dom().querySelector('app-beach-row-lens')).not.toBeNull();
      expect(dom().querySelector('app-beach-map-canvas')).toBeNull();
    });

    it('mounts the canvas, where a tap opens the dialog at once, from sm up', async () => {
      await mount({}, false);
      fixture.detectChanges();
      venueReq().flush(beach());
      await settle();

      expect(dom().querySelector('app-beach-row-lens')).toBeNull();
      expect(dom().querySelector('app-beach-map-canvas')).not.toBeNull();
      await tap(tile(2));
      expect(fixture.debugElement.query(By.directive(BookingDialog))).not.toBeNull();
      expect(tile(2).hasAttribute('aria-pressed')).toBe(false);
      expect(one('pick-bar')).toBeNull();
    });

    it('names each closed row with its row, price and free count, collapsed', async () => {
      await load();

      expect(all('lens-row').map((row) => row.getAttribute('aria-label'))).toEqual([
        'Row B, €35, 2 of 3 free',
        'Row C, €35, 0 of 3 free',
        'Row D, €25, 0 of 2 free',
      ]);
      expect(rowButton('B').getAttribute('aria-expanded')).toBe('false');
    });

    it('bands each zone with its price and a free count that matches the cells drawn', async () => {
      await load();
      await tap(one('lens-close')!);

      const text = (testid: string): string[] => all(testid).map((el) => el.textContent.trim());
      expect(text('lens-band-title')).toEqual(['€45', '€35', '€25']);
      expect(text('lens-band-note')).toEqual(['· 5 of 6 free', '· 2 of 6 free', '· 0 of 2 free']);
      const freeLooks = (code: string): number =>
        cellStates(code).filter((state) => state === 'available' || state === 'premium').length;
      expect([freeLooks('A'), freeLooks('B') + freeLooks('C'), freeLooks('D')]).toEqual([5, 2, 0]);
      // Walk-in sets are free at the venue, not online: drawn as walk-in, never counted.
      expect(cellStates('D')).toEqual(['walkin', 'walkin']);
    });

    it('gives rows that share a band their own count, and a row alone under its band none', async () => {
      await load();
      await tap(one('lens-close')!);

      const note = (code: string): string | null =>
        rowButton(code).querySelector('[data-testid="lens-row-note"]')?.textContent.trim() ?? null;
      expect([note('A'), note('B'), note('C'), note('D')]).toEqual([
        null,
        '2 free',
        '0 free',
        null,
      ]);
    });

    it('shows the overview looks in the legend, with a "Your pick" entry', async () => {
      await load();

      const legend = dom().querySelector('ul[aria-label="Legend"]')!;
      expect(
        [...legend.querySelectorAll<HTMLElement>('[data-testid="legend-cell"]')].map(
          (cell) => cell.dataset['state'],
        ),
      ).toEqual(['available', 'premium', 'partly', 'walkin', 'taken', 'pick']);
      expect(legend.textContent).toContain('Your pick');
    });

    it('keeps the footer and the empty card of the canvas', async () => {
      await load();
      expect(dom().textContent).toContain('Pick any free set to book it');

      TestBed.resetTestingModule();
      await load({ ...beach(), sets: [], fromPrice: null });
      expect(one('map-empty')!.textContent).toContain('No sunbeds mapped yet');
      expect(one('row-lens')).toBeNull();
    });
  });

  describe('the default open row', () => {
    it('is the first row with a free set', async () => {
      await load();
      expect(openCodes()).toEqual(['A']);

      TestBed.resetTestingModule();
      await load(beach(['taken', 'taken', 'taken', 'taken', 'taken', 'taken']));
      expect(openCodes()).toEqual(['B']);
    });

    it('is no row, with the hint, when no set is free', async () => {
      const full = beach();
      await load({
        ...full,
        sets: full.sets.map((set) => ({ ...set, availability: 'TAKEN' as const })),
      });

      expect(openCodes()).toEqual([]);
      expect(one('lens-tap-hint')!.textContent).toContain('Tap a row to open it and pick a set.');
    });

    it('shows the open row’s tiles with their production names', async () => {
      await load();

      expect(tile(2).getAttribute('aria-label')).toBe(
        'A · spot 2, front row, €45, available. Select to book.',
      );
      expect(all('set-tile')).toHaveLength(6);
    });
  });

  describe('the pick', () => {
    it('a tap picks the set and shows the bar; a second tap clears both', async () => {
      await load();
      expect(tile(2).getAttribute('aria-pressed')).toBe('false');

      await tap(tile(2));

      expect(tile(2).getAttribute('aria-pressed')).toBe('true');
      expect(tile(2).closest('li')!.classList.contains('picked')).toBe(true);
      expect(tile(2).closest('li')!.querySelector('[data-testid="pick-tick"]')).not.toBeNull();
      expect(one('pick-summary')!.textContent.replace(/\s+/g, ' ').trim()).toBe('A · spot 2 · €45');
      expect(one('pick-book')!.textContent.trim()).toBe('Book this set');
      expect(fixture.debugElement.query(By.directive(BookingDialog))).toBeNull();

      await tap(tile(2));

      expect(tile(2).getAttribute('aria-pressed')).toBe('false');
      expect(one('pick-bar')).toBeNull();
      expect(all('pick-tick')).toHaveLength(0);
    });

    it('announces the bar through a region that was there before the pick', async () => {
      await load();
      const region = one('pick-status')!;
      expect(region.tagName).toBe('OUTPUT');
      expect(region.textContent.trim()).toBe('');

      await tap(tile(2));

      expect(one('pick-status')).toBe(region);
      expect(region.textContent.trim()).toBe(
        'A · spot 2 picked, €45. The button to continue is at the bottom of the screen.',
      );
    });

    it('a tap on another set moves the pick: there is one at a time', async () => {
      await load();
      await tap(tile(2));
      await tap(tile(3));

      expect(tile(2).getAttribute('aria-pressed')).toBe('false');
      expect(tile(3).getAttribute('aria-pressed')).toBe('true');
      expect(all('pick-tick')).toHaveLength(1);
    });

    it('the bar’s action opens the booking dialog for the pick', async () => {
      await load();
      await tap(tile(3));
      await tap(one('pick-book')!);

      const dialog = fixture.debugElement.query(By.directive(BookingDialog));
      expect((dialog.componentInstance as BookingDialog).set()?.id).toBe(3);
    });

    /** Dismiss the open dialog; the map re-reads, answered with `venue`. */
    async function dismissDialog(venue: VenueMapView): Promise<void> {
      const dialog = fixture.debugElement.query(By.directive(BookingDialog));
      (dialog.componentInstance as BookingDialog).dismissed.emit();
      fixture.detectChanges();
      venueReq().flush(venue);
      await settle();
    }

    it('dismissing the dialog keeps the pick and returns focus to the bar’s action', async () => {
      await load();
      await tap(tile(3));
      await tap(one('pick-book')!);

      await dismissDialog(beach());

      expect(fixture.debugElement.query(By.directive(BookingDialog))).toBeNull();
      expect(tile(3).getAttribute('aria-pressed')).toBe('true');
      expect(document.activeElement).toBe(one('pick-book'));
    });

    it('dismissing re-reads the map, and a pick someone else just booked is dropped with its bar', async () => {
      await load();
      await tap(tile(3));
      await tap(one('pick-book')!);

      const taken = beach();
      await dismissDialog({
        ...taken,
        sets: taken.sets.map((set) => (set.id === 3 ? { ...set, availability: 'TAKEN' } : set)),
      });

      expect(one('pick-bar')).toBeNull();
      expect(one('pick-status')!.textContent.trim()).toBe('');
      expect(all('lens-cell').filter((cell) => cell.dataset['state'] === 'pick')).toHaveLength(0);
      // The row stays open on the fresh map, and focus is not left on <body> with the bar gone.
      expect(openCodes()).toEqual(['A']);
      expect(document.activeElement).toBe(one('beach-grid'));
    });

    it('a failed re-read after a dismiss leaves the map, the pick and the bar as they were', async () => {
      await load();
      await tap(tile(3));
      await tap(one('pick-book')!);

      const dialog = fixture.debugElement.query(By.directive(BookingDialog));
      (dialog.componentInstance as BookingDialog).dismissed.emit();
      fixture.detectChanges();
      venueReq().flush('down', { status: 503, statusText: 'Service Unavailable' });
      await settle();

      expect(one('map-error')).toBeNull();
      expect(one('row-lens')).not.toBeNull();
      expect(tile(3).getAttribute('aria-pressed')).toBe('true');
      expect(document.activeElement).toBe(one('pick-book'));
    });

    it('words the action as a request at a Request-to-Book venue', async () => {
      await load({ ...beach(), bookingMode: 'REQUEST' });
      await tap(tile(2));

      expect(one('pick-book')!.textContent.trim()).toBe('Request this set');
    });

    it('survives closing its row: its overview cell is the one solid cell', async () => {
      await load();
      await tap(rowButton('B'));
      await tap(tile(7));
      await tap(rowButton('A'));

      expect(openCodes()).toEqual(['A']);
      expect(cellStates('B')).toEqual(['pick', 'taken', 'available']);
      expect(all('lens-cell').filter((cell) => cell.dataset['state'] === 'pick')).toHaveLength(1);
      expect(one('pick-summary')!.textContent).toContain('B · spot 1');

      await tap(rowButton('B'));
      expect(tile(7).getAttribute('aria-pressed')).toBe('true');
    });

    it('is cleared when the map is re-read for other days, and the first free row opens again', async () => {
      await load();
      await tap(rowButton('B'));
      await tap(tile(7));

      const other = addDays(defaultBookingDate(new Date()), 3);
      queryParams$.next(convertToParamMap({ date: other }));
      fixture.detectChanges();
      venueReq().flush(beach());
      await settle();

      expect(one('pick-bar')).toBeNull();
      expect(one('pick-status')!.textContent.trim()).toBe('');
      expect(openCodes()).toEqual(['A']);
      await tap(rowButton('B'));
      expect(tile(7).getAttribute('aria-pressed')).toBe('false');
    });

    it('is cleared when the booking goes through', async () => {
      await load();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await tap(tile(2));
      await tap(one('pick-book')!);

      const dialog = fixture.debugElement.query(By.directive(BookingDialog));
      (dialog.componentInstance as BookingDialog).booked.emit({} as BookingConfirmation);
      await settle();

      expect(navigate).toHaveBeenCalledWith(['/booking/confirmation']);
      expect(one('pick-bar')).toBeNull();
    });

    it('never offers a taken or walk-in set as a pick', async () => {
      await load();
      await tap(rowButton('D'));

      expect(all('set-tile')).toHaveLength(2);
      expect(dom().querySelectorAll('[data-testid="set-tile"] button')).toHaveLength(0);
    });
  });

  describe('a stay', () => {
    const first = defaultBookingDate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
    const last = addDays(first, 2);

    /** Nothing free throughout: A2 and B1 partly free, so a plan stitches the two. */
    function stay(): VenueMapView {
      const base = beach();
      return {
        ...base,
        sets: base.sets.map((set) => {
          if (set.id === 2) {
            return { ...set, availability: 'PARTLY_FREE', freeDays: 2, takenDates: [last] };
          }
          if (set.id === 7) {
            return { ...set, availability: 'PARTLY_FREE', freeDays: 2, takenDates: [first] };
          }
          return { ...set, availability: 'TAKEN', freeDays: 0 };
        }),
      };
    }

    function stitched(): ItineraryView {
      const stretch = (
        setId: number,
        rowLabel: string,
        positionNo: number,
        from: string,
        to: string,
      ) => ({
        setId,
        rowLabel,
        positionNo,
        gridX: positionNo,
        gridY: 1,
        tier: 'STANDARD' as const,
        firstDate: from,
        lastDate: to,
        days: 1,
        pricePerDay: { minorUnits: 3500, currency: 'EUR' },
        amount: { minorUnits: 3500, currency: 'EUR' },
      });
      return {
        maxMoves: 3,
        plan: {
          moves: 1,
          stretches: [stretch(2, 'A', 2, first, addDays(first, 1)), stretch(7, 'B', 1, last, last)],
          movesBetween: [{ onDate: last, rowsAway: 1, positionsAway: 0, towardSea: false }],
          total: { minorUnits: 7000, currency: 'EUR' },
        },
      };
    }

    async function loadStay(): Promise<void> {
      await mount({ date: first, lastDate: last });
      fixture.detectChanges();
      venueReq().flush(stay());
      await settle();
      httpMock
        .expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues/1/itinerary`)
        .flush(stitched());
      await settle();
    }

    it('draws a partly-free set as a half fill in its row’s hue and counts it as not free', async () => {
      await loadStay();

      expect(openCodes()).toEqual([]);
      expect(cellStates('A')[1]).toBe('partly-premium');
      expect(cellStates('B')[0]).toBe('partly');
      expect(rowButton('A').getAttribute('aria-label')).toBe('Row A, €45, 0 of 6 free');
    });

    it('a partly-free tile opens the sheet and never becomes the pick', async () => {
      await loadStay();
      await tap(rowButton('A'));
      await tap(tile(2));

      expect(fixture.debugElement.query(By.directive(PartlyFreeSheet))).not.toBeNull();
      expect(one('pick-bar')).toBeNull();
      expect(tile(2).hasAttribute('aria-pressed')).toBe(false);
    });

    it('closing the sheet returns focus to its tile', async () => {
      await loadStay();
      await tap(rowButton('A'));
      await tap(tile(2));

      const sheet = fixture.debugElement.query(By.directive(PartlyFreeSheet));
      (sheet.componentInstance as PartlyFreeSheet).dismissed.emit();
      await settle();

      expect(document.activeElement).toBe(tile(2));
    });

    it('rings each plan set’s overview cell in its stretch colour; the number stays on the tile', async () => {
      await loadStay();
      await tap(one('no-cover-plan')!);

      const ring = (code: string, index: number): string =>
        rowButton(code).querySelectorAll<HTMLElement>('[data-testid="lens-cell"]')[index].style
          .outline;
      expect(ring('A', 1)).toBe('1.5px solid var(--riv-stretch-1-ring)');
      expect(ring('B', 0)).toBe('1.5px solid var(--riv-stretch-2-ring)');
      expect(dom().querySelectorAll('[data-ring]')).toHaveLength(2);
      expect(dom().querySelectorAll('[data-lens-cells] [data-testid="plan-number"]')).toHaveLength(
        0,
      );

      await tap(rowButton('A'));
      const numbered = dom().querySelector('[data-testid="set-tile"] [data-testid="plan-number"]');
      expect(numbered!.textContent.trim()).toBe('1');
    });
  });
});
