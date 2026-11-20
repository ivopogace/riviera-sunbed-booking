import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { ProofOfWork } from '../core/proof-of-work';
import { addDays, defaultBookingDate } from '../shared/booking-date';
import { ItineraryView, SetView, VenueMapView } from '../shared/venue-views';
import { VenueMap } from './venue-map';

/**
 * The two ways the venue page reloads under the visitor (#1810). An in-place route change: the
 * router reuses the page when `:id`, `?date` or `?lastDate` change, and the reset rebuilds everything
 * under the "All beaches" button. A date change: the old days' map stays on screen, inert, until
 * the read for the new days answers. jsdom focuses an `inert` element and delivers it clicks, so
 * `e2e/venue-map-reload.e2e.ts` owns the proof in a browser.
 */
const first = addDays(defaultBookingDate(new Date()), 3);
const last = addDays(first, 2);

function set(id: number, availability: SetView['availability'], takenDates: string[]): SetView {
  return {
    id,
    rowLabel: 'A',
    positionNo: id,
    tier: 'PREMIUM',
    pool: 'ONLINE',
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: id,
    gridY: 1,
    availability,
    freeDays: 3 - takenDates.length,
    takenDates,
  };
}

function venue(id: number, sets: SetView[]): VenueMapView {
  return {
    id,
    name: id === 1 ? 'Miramar Beach Club' : 'Riviera Blue',
    beach: 'KSAMIL',
    region: 'SARANDE',
    description: '',
    ratingTenths: 48,
    reviewsCount: 3,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 4500, currency: 'EUR' },
    sets,
  };
}

const freeBeach = (id = 1): VenueMapView =>
  venue(id, [set(1, 'FREE', []), set(2, 'FREE', []), set(3, 'TAKEN', [first])]);

/** No set covers the stay: set 1 hosts the first two days, set 2 the last. */
const noCoverBeach = (id = 1): VenueMapView =>
  venue(id, [
    set(1, 'PARTLY_FREE', [last]),
    set(2, 'PARTLY_FREE', [first, addDays(first, 1)]),
    set(3, 'TAKEN', [first, addDays(first, 1), last]),
  ]);

function stitched(): ItineraryView {
  const stretch = (setId: number, firstDate: string, lastDate: string, days: number) => ({
    setId,
    rowLabel: 'A',
    positionNo: setId,
    gridX: setId,
    gridY: 1,
    tier: 'PREMIUM' as const,
    firstDate,
    lastDate,
    days,
    pricePerDay: { minorUnits: 4500, currency: 'EUR' },
    amount: { minorUnits: 4500 * days, currency: 'EUR' },
  });
  return {
    maxMoves: 3,
    plan: {
      moves: 1,
      stretches: [stretch(1, first, addDays(first, 1), 2), stretch(2, last, last, 1)],
      movesBetween: [{ onDate: last, rowsAway: 0, positionsAway: 1, towardSea: false }],
      total: { minorUnits: 13500, currency: 'EUR' },
    },
  };
}

class FakeProofOfWork {
  readonly enabled = signal<boolean | undefined>(false);
}

describe('VenueMap: reloading under the visitor (#1810)', () => {
  let fixture: ComponentFixture<VenueMap>;
  let httpMock: HttpTestingController;
  let params$: BehaviorSubject<ParamMap>;
  let queryParams$: BehaviorSubject<ParamMap>;

  async function mount(query: Record<string, string> = {}, phone = false): Promise<void> {
    vi.stubGlobal('matchMedia', () => ({
      matches: phone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    params$ = new BehaviorSubject(convertToParamMap({ id: '1' }));
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
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.match((req) => req.url.endsWith('/reviews'));
    httpMock.match((req) => req.url.endsWith('/availability-calendar'));
    vi.unstubAllGlobals();
    try {
      httpMock.verify();
    } finally {
      // One test's unanswered read must not fail the next one's module set-up.
      TestBed.resetTestingModule();
    }
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

  const venueReq = (id = 1): TestRequest =>
    httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues/${id}`);
  const itineraryReq = (id = 1): TestRequest =>
    httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues/${id}/itinerary`);
  const dom = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const one = (testid: string): HTMLElement =>
    dom().querySelector<HTMLElement>(`[data-testid="${testid}"]`)!;
  const tile = (setId: number): HTMLButtonElement =>
    dom().querySelector<HTMLButtonElement>(`button[data-set-id="${setId}"]`)!;

  async function loadFree(phone = false): Promise<void> {
    await mount({}, phone);
    venueReq().flush(freeBeach());
    await settle();
  }

  async function loadNoCover(): Promise<void> {
    await mount({ date: first, lastDate: last });
    venueReq().flush(noCoverBeach());
    await settle();
    itineraryReq().flush(stitched());
    await settle();
  }

  /** The route's venue changes in place; venue 2's read is left in flight. */
  async function switchVenue(): Promise<void> {
    params$.next(convertToParamMap({ id: '2' }));
    await settle();
  }

  async function tap(target: HTMLElement): Promise<void> {
    target.click();
    await settle();
  }

  describe('an in-place route change: focus the reset would strand lands on "All beaches"', () => {
    it('from the open calendar', async () => {
      await loadFree();
      await tap(one('map-date'));
      expect(dom().querySelector('app-availability-calendar')).not.toBeNull();
      expect(dom().contains(document.activeElement)).toBe(true);

      await switchVenue();

      expect(document.activeElement).toBe(one('venue-back'));
      venueReq(2).flush(freeBeach(2));
    });

    it('from the open partly-free sheet', async () => {
      await loadNoCover();
      await tap(tile(1));
      expect(dom().querySelector('app-partly-free-sheet')).not.toBeNull();
      expect(dom().contains(document.activeElement)).toBe(true);

      await switchVenue();

      expect(document.activeElement).toBe(one('venue-back'));
      venueReq(2).flush(freeBeach(2));
    });

    it('from the open booking dialog, which the old condition never counted', async () => {
      await loadFree();
      await tap(tile(1));
      const dialog = dom().querySelector('app-booking-dialog')!;
      expect(dialog.contains(document.activeElement)).toBe(true);

      await switchVenue();

      expect(dom().querySelector('app-booking-dialog')).toBeNull();
      expect(document.activeElement).toBe(one('venue-back'));
      venueReq(2).flush(freeBeach(2));
    });

    it('from a map tile, with no modal open', async () => {
      await loadFree();
      tile(2).focus();

      await switchVenue();

      expect(document.activeElement).toBe(one('venue-back'));
      venueReq(2).flush(freeBeach(2));
    });

    it('from the pick bar’s action on a phone, when the days change', async () => {
      await loadFree(true);
      await tap(tile(1));
      one('pick-book').focus();

      queryParams$.next(convertToParamMap({ date: addDays(first, 7) }));
      await settle();

      expect(document.activeElement).toBe(one('venue-back'));
      venueReq().flush(freeBeach());
    });

    it('from a control of an open lens row on a phone', async () => {
      await loadFree(true);
      const close = dom().querySelector<HTMLElement>('[data-lens-open="A"] button')!;
      close.focus();
      expect(document.activeElement).toBe(close);

      await switchVenue();

      expect(document.activeElement).toBe(one('venue-back'));
      venueReq(2).flush(freeBeach(2));
    });

    it('and stays there once the new venue is on screen', async () => {
      await loadFree();
      tile(2).focus();
      await switchVenue();

      venueReq(2).flush(freeBeach(2));
      await settle();

      expect(dom().querySelector('h1')!.textContent).toContain('Riviera Blue');
      expect(document.activeElement).toBe(one('venue-back'));
    });
  });

  describe('an in-place route change: focus the reset does not take stays where it is', () => {
    it('outside the page', async () => {
      await loadFree();
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();

      await switchVenue();

      expect(document.activeElement).toBe(outside);
      outside.remove();
      venueReq(2).flush(freeBeach(2));
    });

    it('on <body>', async () => {
      await loadFree();
      (document.activeElement as HTMLElement | null)?.blur();
      expect(document.activeElement).toBe(document.body);

      await switchVenue();

      expect(document.activeElement).toBe(document.body);
      venueReq(2).flush(freeBeach(2));
    });

    it('on a fresh mount', async () => {
      (document.activeElement as HTMLElement | null)?.blur();

      await loadFree();

      expect(document.activeElement).toBe(document.body);
    });
  });

  describe('an in-place route change: a plan chosen for booking', () => {
    async function openPlanDialog(): Promise<void> {
      await loadNoCover();
      await tap(one('no-cover-plan'));
      await tap(one('stay-plan-book'));
      expect(dom().querySelector('app-booking-dialog')).not.toBeNull();
    }

    it('is dropped with the venue, so its dialog does not reopen under the next one', async () => {
      await openPlanDialog();

      await switchVenue();
      venueReq(2).flush(noCoverBeach(2));
      await settle();
      itineraryReq(2).flush(stitched());
      await settle();

      expect(dom().querySelector('h1')!.textContent).toContain('Riviera Blue');
      expect(dom().querySelector('app-booking-dialog')).toBeNull();
      expect(document.activeElement).toBe(one('venue-back'));
    });

    it('is dropped with the days, so its dialog does not reopen over another stay', async () => {
      await openPlanDialog();

      queryParams$.next(convertToParamMap({ date: addDays(first, 7), lastDate: addDays(last, 7) }));
      await settle();
      venueReq().flush(freeBeach());
      await settle();

      expect(dom().querySelector('app-booking-dialog')).toBeNull();
    });
  });

  describe('a date change: the old days’ map while the new days load', () => {
    const otherDay = addDays(first, 7);
    const map = (): HTMLElement =>
      dom().querySelector<HTMLElement>('app-beach-map-canvas, app-beach-row-lens')!;
    const pickDays = (firstDay: string, lastDay = firstDay): void => {
      (
        fixture.componentInstance as unknown as {
          onDatesChange(days: { first: string; last: string }): void;
        }
      ).onDatesChange({ first: firstDay, last: lastDay });
    };

    for (const phone of [false, true]) {
      it(`is inert and busy until the read answers (${phone ? 'the lens' : 'the canvas'})`, async () => {
        await loadFree(phone);
        expect(map().hasAttribute('inert')).toBe(false);
        expect(map().getAttribute('aria-busy')).toBe('false');

        pickDays(otherDay);
        await settle();

        expect(map().hasAttribute('inert')).toBe(true);
        expect(map().getAttribute('aria-busy')).toBe('true');

        venueReq().flush(freeBeach());
        await settle();

        expect(map().hasAttribute('inert')).toBe(false);
        expect(map().getAttribute('aria-busy')).toBe('false');
      });
    }

    it('stays usable through a re-read for the same days', async () => {
      await loadFree();

      (fixture.componentInstance as unknown as { retry(): void }).retry();
      await settle();

      expect(map().hasAttribute('inert')).toBe(false);
      expect(map().getAttribute('aria-busy')).toBe('false');
      venueReq().flush(freeBeach());
    });

    it('is usable again on the map a retry brings back after the read failed', async () => {
      await loadFree();
      pickDays(otherDay);
      venueReq().flush('down', { status: 503, statusText: 'Service Unavailable' });
      await settle();
      expect(map()).toBeNull();

      await tap(one('map-retry'));
      venueReq().flush(freeBeach());
      await settle();

      expect(map().hasAttribute('inert')).toBe(false);
    });

    it('is usable again on the venue a route change brings in mid-load', async () => {
      await loadFree();
      pickDays(otherDay);
      const superseded = venueReq();

      await switchVenue();
      superseded.flush(freeBeach());
      venueReq(2).flush(freeBeach(2));
      await settle();

      expect(dom().querySelector('h1')!.textContent).toContain('Riviera Blue');
      expect(map().hasAttribute('inert')).toBe(false);
    });

    it('hands focus it held to the date field', async () => {
      await loadFree();
      tile(2).focus();

      pickDays(otherDay);
      await settle();

      expect(document.activeElement).toBe(one('map-date'));
      venueReq().flush(freeBeach());
    });

    it('leaves focus on a control that stays usable', async () => {
      await loadNoCover();
      const others = one('no-cover-others');
      others.focus();

      pickDays(otherDay, addDays(otherDay, 2));
      await settle();

      expect(document.activeElement).toBe(others);
      venueReq().flush(noCoverBeach());
      await settle();
      itineraryReq().flush(stitched());
    });

    it('shortening from the sheet parks focus on the date field, then on the tile if it is still not free', async () => {
      await loadNoCover();
      await tap(tile(1));
      await tap(one('shorten-stay'));

      expect(dom().querySelector('app-partly-free-sheet')).toBeNull();
      expect(map().hasAttribute('inert')).toBe(true);
      expect(document.activeElement).toBe(one('map-date'));

      // Someone took the spot meanwhile: the re-read still shows it partly free, so no dialog opens.
      venueReq().flush(noCoverBeach());
      await settle();
      itineraryReq().flush(stitched());
      await settle();

      expect(dom().querySelector('app-booking-dialog')).toBeNull();
      expect(document.activeElement).toBe(tile(1));
    });
  });
});
