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
 * An in-place route change (#1810): the router reuses the page when `:id`, `?date` or `?lastDate`
 * change, and the reset rebuilds everything under the "All beaches" button. jsdom focuses an
 * `inert` element, so `e2e/venue-route-change.e2e.ts` owns the proof that the landing takes focus.
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

describe('VenueMap: an in-place route change (#1810)', () => {
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

  describe('focus the reset would strand lands on the "All beaches" button', () => {
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

  describe('focus the reset does not take stays where it is', () => {
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

  describe('a plan chosen for booking', () => {
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
});
