import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { BookingDialog } from '../booking/booking-dialog';
import { ProofOfWork } from '../core/proof-of-work';
import { addDays, defaultBookingDate } from '../shared/booking-date';
import { formatBookingDate } from '../shared/booking-date-label';
import { ItineraryView, SetView, VenueMapView } from '../shared/venue-views';
import { freezeClock } from '../../testing/freeze-clock';
import { VenueMap } from './venue-map';

/**
 * The two ways the venue page reloads under the visitor (#1810). An in-place route change: the
 * router reuses the page when `:id`, `?date` or `?lastDate` change, and the reset rebuilds everything
 * under the "All beaches" button. A date change: the old days' map stays on screen, inert, until
 * the read for the new days answers. And "Try again" on the failure panel (#1816). jsdom focuses
 * an `inert` element and delivers it clicks, so `e2e/venue-map-reload.e2e.ts` owns the proof in a
 * browser.
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

    it('from a map tile, with no modal open, scrolling up to the button', async () => {
      await loadFree();
      tile(2).focus();
      const focus = vi.spyOn(one('venue-back'), 'focus');

      await switchVenue();

      expect(document.activeElement).toBe(one('venue-back'));
      expect(focus).toHaveBeenCalledWith({ preventScroll: false });
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
      try {
        outside.focus();

        await switchVenue();

        expect(document.activeElement).toBe(outside);
      } finally {
        outside.remove();
      }
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

  describe('"Try again" on the failure panel (#1816)', () => {
    const down = { status: 503, statusText: 'Service Unavailable' };

    /** The first read failed: the panel is up, and focus is on its button unless `focused` is false. */
    async function failThenFocusRetry(focused = true): Promise<void> {
      await mount();
      venueReq().flush('down', down);
      await settle();
      if (focused) {
        one('map-retry').focus();
      }
    }

    it('hands focus to "All beaches" while the read is in flight, and leaves it there on the map', async () => {
      await failThenFocusRetry();

      await tap(one('map-retry'));

      expect(one('map-loading')).not.toBeNull();
      expect(document.activeElement).toBe(one('venue-back'));

      venueReq().flush(freeBeach());
      await settle();

      expect(document.activeElement).toBe(one('venue-back'));
    });

    it('returns focus to the new button when the read fails again', async () => {
      await failThenFocusRetry();
      const pressed = one('map-retry');

      await tap(pressed);
      venueReq().flush('down', down);
      await settle();

      expect(one('map-retry')).not.toBe(pressed);
      expect(document.activeElement).toBe(one('map-retry'));
    });

    it('leaves focus the visitor moved out of the page while it loaded', async () => {
      await failThenFocusRetry();
      const outside = document.body.appendChild(document.createElement('button'));
      try {
        await tap(one('map-retry'));
        expect(document.activeElement).toBe(one('venue-back'));
        outside.focus();

        venueReq().flush('down', down);
        await settle();

        expect(document.activeElement).toBe(outside);
      } finally {
        outside.remove();
      }
    });

    it('moves no focus for a press that left it on <body>, as a pointer press may', async () => {
      await failThenFocusRetry(false);
      expect(document.activeElement).toBe(document.body);

      await tap(one('map-retry'));
      expect(document.activeElement).toBe(document.body);

      venueReq().flush('down', down);
      await settle();

      expect(one('map-retry')).not.toBeNull();
      expect(document.activeElement).toBe(document.body);
    });

    it('leaves focus on "All beaches" when the retry finds the venue gone', async () => {
      await failThenFocusRetry();

      await tap(one('map-retry'));
      venueReq().flush('gone', { status: 404, statusText: 'Not Found' });
      await settle();

      expect(one('map-not-found')).not.toBeNull();
      expect(document.activeElement).toBe(one('venue-back'));
    });

    it('a route change during the retry owns the next failure: focus stays on "All beaches"', async () => {
      await failThenFocusRetry();
      await tap(one('map-retry'));
      const superseded = venueReq();

      await switchVenue();
      expect(superseded.cancelled).toBe(false);
      venueReq(2).flush('down', down);
      await settle();

      expect(one('map-error')).not.toBeNull();
      expect(document.activeElement).toBe(one('venue-back'));
    });
  });

  describe('a date change: the old days’ map while the new days load', () => {
    const otherDay = addDays(first, 7);
    const map = (): HTMLElement =>
      dom().querySelector<HTMLElement>('app-beach-map-canvas, app-beach-row-lens')!;
    /** The map card wears the dim. Its value is the browser's to prove (`e2e/venue-map-reload.e2e.ts`). */
    const dimmed = (): boolean => map().classList.contains('opacity-50');
    const line = (): string => one('availability').textContent.replace(/\s+/g, ' ').trim();
    const dayLabel = (iso: string): string => formatBookingDate(iso, { withYear: true });
    const pickDays = (firstDay: string, lastDay = firstDay): void => {
      (
        fixture.componentInstance as unknown as {
          onDatesChange(days: { first: string; last: string }): void;
        }
      ).onDatesChange({ first: firstDay, last: lastDay });
    };

    for (const phone of [false, true]) {
      it(`is inert until the read answers, and never busy: an inert node is not exposed (${phone ? 'the lens' : 'the canvas'})`, async () => {
        await loadFree(phone);
        expect(map().hasAttribute('inert')).toBe(false);
        expect(dimmed()).toBe(false);

        pickDays(otherDay);
        await settle();

        expect(map().hasAttribute('inert')).toBe(true);
        expect(dimmed()).toBe(true);
        expect(map().hasAttribute('aria-busy')).toBe(false);

        venueReq().flush(freeBeach());
        await settle();

        expect(map().hasAttribute('inert')).toBe(false);
        expect(dimmed()).toBe(false);
      });
    }

    it('stays usable through a re-read for the same days', async () => {
      await loadFree();

      (fixture.componentInstance as unknown as { retry(): void }).retry();
      await settle();

      expect(map().hasAttribute('inert')).toBe(false);
      expect(dimmed()).toBe(false);
      expect(line()).toBe(`2 of 3 sets free on ${dayLabel(defaultBookingDate(new Date()))}`);
      venueReq().flush(freeBeach());
    });

    describe('beside the refresh after a refused booking (#1809, #1812)', () => {
      /** Open the dialog on set 1 and close it as it does after a refusal that leaves the map stale. */
      async function closeOnSetTaken(query: Record<string, string> = {}): Promise<TestRequest> {
        await mount(query);
        venueReq().flush(freeBeach());
        await settle();
        await tap(tile(1));
        const dialog = fixture.debugElement.query(By.directive(BookingDialog))
          .componentInstance as BookingDialog;
        dialog.dismissed.emit({ mapStale: true });
        await settle();
        return venueReq();
      }

      it('ends with the page: a refresh in flight when the visitor leaves is dropped (#1817)', async () => {
        const refresh = await closeOnSetTaken();

        fixture.destroy();

        expect(refresh.cancelled).toBe(true);
      });

      it('keeps focus on a tile that turns partly free: its "which days" button takes it, unscrolled (#1817)', async () => {
        const refresh = await closeOnSetTaken({ date: first, lastDate: last });
        const bookButton = tile(1);
        expect(document.activeElement).toBe(bookButton);

        refresh.flush(
          venue(1, [set(1, 'PARTLY_FREE', [last]), set(2, 'FREE', []), set(3, 'TAKEN', [first])]),
        );
        await settle();

        expect(tile(1)).not.toBe(bookButton);
        expect(tile(1).getAttribute('aria-label')).toContain('Select to see which days');
        expect(document.activeElement).toBe(tile(1));
      });

      it('leaves focus alone when the refresh keeps the tile’s button', async () => {
        const refresh = await closeOnSetTaken();
        const focus = vi.spyOn(tile(1), 'focus');

        refresh.flush(freeBeach());
        await settle();

        expect(document.activeElement).toBe(tile(1));
        expect(focus).not.toHaveBeenCalled();
      });

      it('the map is not inert while that same-days read is in flight', async () => {
        const refresh = await closeOnSetTaken();

        expect(map().hasAttribute('inert')).toBe(false);
        expect(dimmed()).toBe(false);
        expect(line()).not.toContain('Checking');
        refresh.flush(freeBeach());
      });

      it('a route change during it drops its answer and still lands focus on "All beaches"', async () => {
        const refresh = await closeOnSetTaken();
        expect(document.activeElement).toBe(tile(1));

        await switchVenue();
        refresh.flush({ ...freeBeach(), name: 'Stale Miramar' });
        await settle();

        expect(dom().querySelector('h1')).toBeNull();
        expect(document.activeElement).toBe(one('venue-back'));
        venueReq(2).flush(freeBeach(2));
        await settle();
        expect(dom().querySelector('h1')!.textContent).toContain('Riviera Blue');
        expect(document.activeElement).toBe(one('venue-back'));
      });

      it('a date change during it makes the map inert until the new days’ read answers', async () => {
        const refresh = await closeOnSetTaken();

        pickDays(otherDay);
        await settle();
        refresh.flush({ ...freeBeach(), name: 'Stale Miramar' });
        await settle();

        expect(dom().querySelector('h1')!.textContent).not.toContain('Stale Miramar');
        expect(map().hasAttribute('inert')).toBe(true);
        venueReq().flush(freeBeach());
        await settle();
        expect(map().hasAttribute('inert')).toBe(false);
        expect(dom().querySelector('h1')!.textContent).toContain('Miramar Beach Club');
      });
    });

    describe('the refresh owed to a refusal seen while the new days loaded (#1812)', () => {
      const mark = (): HTMLElement | null =>
        dom().querySelector('[data-testid="availability-wait"]');
      let heard: string[];
      let observer: MutationObserver;

      /** A date change's load in flight, a refusal reported under it, then the load's answer: the owed refresh is in flight. */
      async function owedRefresh(): Promise<TestRequest> {
        await loadFree();
        heard = [];
        observer = new MutationObserver(() => {
          if (heard.at(-1) !== line()) {
            heard.push(line());
          }
        });
        observer.observe(one('availability'), {
          childList: true,
          subtree: true,
          characterData: true,
        });
        pickDays(otherDay);
        await settle();
        (
          fixture.componentInstance as unknown as { onDialogClose(d: { mapStale: boolean }): void }
        ).onDialogClose({ mapStale: true });
        venueReq().flush(freeBeach());
        await settle();
        return venueReq();
      }

      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      });

      afterEach(() => {
        observer.disconnect();
        freezeClock();
      });

      it('is a same-days read: no dim, no loading line and no progress mark, however long it runs', async () => {
        const refresh = await owedRefresh();

        vi.advanceTimersByTime(5000);
        await settle();

        expect(map().hasAttribute('inert')).toBe(false);
        expect(dimmed()).toBe(false);
        expect(mark()).toBeNull();
        expect(line()).toBe(`2 of 3 sets free on ${dayLabel(otherDay)}`);
        refresh.flush(freeBeach());
      });

      it('speaks the count once, for the load’s answer, when the refresh finds it unchanged', async () => {
        const refresh = await owedRefresh();

        refresh.flush(freeBeach());
        await settle();

        expect(heard).toEqual([
          `Checking availability for ${dayLabel(otherDay)}…`,
          `2 of 3 sets free on ${dayLabel(otherDay)}`,
        ]);
      });

      it('speaks the count again only because the refresh changed it', async () => {
        const refresh = await owedRefresh();

        refresh.flush(
          venue(1, [set(1, 'TAKEN', [otherDay]), set(2, 'FREE', []), set(3, 'TAKEN', [otherDay])]),
        );
        await settle();

        expect(heard).toEqual([
          `Checking availability for ${dayLabel(otherDay)}…`,
          `2 of 3 sets free on ${dayLabel(otherDay)}`,
          `1 of 3 sets free on ${dayLabel(otherDay)}`,
        ]);
      });

      it('its 404 takes the map down with no busy state left: the next venue’s line is its count', async () => {
        const refresh = await owedRefresh();

        refresh.flush('gone', { status: 404, statusText: 'Not Found' });
        await settle();
        expect(dom().querySelector('[data-testid="map-not-found"]')).not.toBeNull();
        await switchVenue();
        venueReq(2).flush(freeBeach(2));
        await settle();
        vi.advanceTimersByTime(5000);
        await settle();

        expect(dimmed()).toBe(false);
        expect(mark()).toBeNull();
        expect(line()).toContain('2 of 3 sets free on');
      });
    });

    it('a refresh’s 404 arriving after a date change is dropped: the old map stays, checking, until the load answers', async () => {
      await loadFree();
      await tap(tile(1));
      (
        fixture.debugElement.query(By.directive(BookingDialog)).componentInstance as BookingDialog
      ).dismissed.emit({
        mapStale: true,
      });
      await settle();
      const refresh = venueReq();

      pickDays(otherDay);
      await settle();
      refresh.flush('gone', { status: 404, statusText: 'Not Found' });
      await settle();

      expect(dom().querySelector('[data-testid="map-not-found"]')).toBeNull();
      expect(map().hasAttribute('inert')).toBe(true);
      expect(line()).toBe(`Checking availability for ${dayLabel(otherDay)}…`);
      venueReq().flush(freeBeach());
      await settle();
      expect(dimmed()).toBe(false);
      expect(line()).toBe(`2 of 3 sets free on ${dayLabel(otherDay)}`);
    });

    for (const last of ['answers', 'fails'] as const) {
      it(`stays inert through an overlapping same-days read, until the last read ${last}`, async () => {
        await loadFree();
        pickDays(otherDay);
        const superseded = venueReq();
        // The plan dialog's close and Retry dispatch this same read while the date change is in flight.
        (fixture.componentInstance as unknown as { retry(): void }).retry();
        const latest = venueReq();

        superseded.flush(freeBeach());
        await settle();
        expect(map().hasAttribute('inert')).toBe(true);

        if (last === 'answers') {
          latest.flush(freeBeach());
          await settle();
          expect(map().hasAttribute('inert')).toBe(false);
        } else {
          latest.flush('down', { status: 503, statusText: 'Service Unavailable' });
          await settle();
          expect(map()).toBeNull();
          expect(document.activeElement).toBe(one('map-error'));
        }
      });
    }

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
      expect(dimmed()).toBe(false);
      expect(line()).toBe(`2 of 3 sets free on ${dayLabel(otherDay)}`);
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
      await loadFree();
      one('venue-back').focus();

      pickDays(otherDay);
      await settle();

      expect(document.activeElement).toBe(one('venue-back'));
      venueReq().flush(freeBeach());
    });

    it('takes the no-cover banner with it: its sentence is the old days’ map under the new days’ count', async () => {
      await loadNoCover();
      one('no-cover-shorten').focus();

      pickDays(otherDay, addDays(otherDay, 2));
      await settle();

      expect(dom().querySelector('[data-testid="no-cover"]')).toBeNull();
      expect(document.activeElement).toBe(one('map-date'));
      venueReq().flush(noCoverBeach());
      await settle();
      itineraryReq().flush(stitched());
      await settle();
      expect(dom().querySelector('[data-testid="no-cover"]')).not.toBeNull();
    });

    it('shows no banner the old days’ map alone would raise under a stay just picked', async () => {
      await mount();
      venueReq().flush(venue(1, [set(1, 'TAKEN', [first]), set(2, 'TAKEN', [first])]));
      await settle();

      pickDays(otherDay, addDays(otherDay, 2));
      await settle();

      expect(dom().querySelector('[data-testid="no-cover"]')).toBeNull();
      venueReq().flush(freeBeach());
    });

    describe('the sales-closed alert (#1822)', () => {
      const alert = (): HTMLElement | null =>
        dom().querySelector('[data-testid="map-sales-closed"]');
      const closed = () => ({ ...freeBeach(), salesOpen: false });

      async function leaveClosedDay(): Promise<void> {
        await mount();
        venueReq().flush(closed());
        await settle();
        expect(alert()?.textContent).toContain('Online sales for today have closed');
        pickDays(otherDay);
        await settle();
      }

      it('is withheld while the new days load: the old day’s verdict is not the new day’s', async () => {
        await leaveClosedDay();

        expect(alert()).toBeNull();
        expect(dom().querySelector('[role="alert"]')).toBeNull();
        venueReq().flush(freeBeach());
        await settle();
        expect(alert()).toBeNull();
      });

      it('returns as a new alert, worded for the new day, when its read answers closed too', async () => {
        await leaveClosedDay();

        venueReq().flush(closed());
        await settle();

        expect(alert()?.getAttribute('role')).toBe('alert');
        expect(alert()?.textContent).toContain('Online sales for that date have closed');
      });

      it('stays through a same-days re-read', async () => {
        await mount();
        venueReq().flush(closed());
        await settle();
        const shown = alert();

        (fixture.componentInstance as unknown as { refresh(): void }).refresh();
        await settle();

        expect(shown).not.toBeNull();
        expect(alert()).toBe(shown);
        venueReq().flush(closed());
      });

      it('leaves the season notice in place: it speaks of the venue, not of the picked day', async () => {
        const season = { ...closed(), closedForSeason: true, reopensOn: addDays(otherDay, 30) };
        await mount();
        venueReq().flush(season);
        await settle();
        const notice = one('map-closed-for-season');
        const text = notice.textContent;

        pickDays(otherDay);
        await settle();

        expect(one('map-closed-for-season')).toBe(notice);
        expect(notice.textContent).toBe(text);
        expect(alert()).toBeNull();
        venueReq().flush(season);
        await settle();
        expect(one('map-closed-for-season')).toBe(notice);
      });
    });

    it('the availability line says it is checking the new days, never the old count', async () => {
      await loadFree();
      const region = one('availability');

      pickDays(otherDay);
      await settle();

      expect(line()).toBe(`Checking availability for ${dayLabel(otherDay)}…`);
      expect(one('availability')).toBe(region);
      venueReq().flush(venue(1, [set(1, 'FREE', []), set(2, 'TAKEN', [otherDay])]));
      await settle();
      expect(line()).toBe(`1 of 2 sets free on ${dayLabel(otherDay)}`);
      expect(one('availability')).toBe(region);
    });

    it('names a stay as the date field does', async () => {
      await loadFree();

      pickDays(otherDay, addDays(otherDay, 2));
      await settle();

      expect(line()).toBe(`Checking availability for ${one('map-date').textContent.trim()}…`);
      venueReq().flush(freeBeach());
    });

    it('an unchanged count is still a change of the line, so it is spoken again', async () => {
      await loadFree();
      const heard: string[] = [];
      const observer = new MutationObserver(() => heard.push(line()));
      observer.observe(one('availability'), {
        childList: true,
        subtree: true,
        characterData: true,
      });

      pickDays(otherDay);
      await settle();
      venueReq().flush(freeBeach());
      await settle();
      observer.disconnect();

      expect([...new Set(heard)]).toEqual([
        `Checking availability for ${dayLabel(otherDay)}…`,
        `2 of 3 sets free on ${dayLabel(otherDay)}`,
      ]);
    });

    it('the line is one whole status: polite and atomic', async () => {
      await loadFree();

      expect(one('availability').getAttribute('aria-live')).toBe('polite');
      expect(one('availability').getAttribute('aria-atomic')).toBe('true');
    });

    it('the bar shows no proportion while the new days load', async () => {
      await loadFree();
      const fill = (): string => one('availability-bar').querySelector('span')!.style.width;
      expect(fill()).not.toBe('0%');

      pickDays(otherDay);
      await settle();

      expect(fill()).toBe('0%');
      venueReq().flush(freeBeach());
      await settle();
      expect(fill()).not.toBe('0%');
    });

    describe('the line’s box while it reads "Checking…" (#1836)', () => {
      /** The count's empty twin. That it holds the line's height is the browser's to prove (`e2e/venue-map-reload.e2e.ts`). */
      const twin = (): HTMLElement | null => one('availability').querySelector('span');
      const markSlot = (): HTMLElement | null =>
        one('availability').parentElement!.querySelector(':scope > span');

      it('is never shorter than the count line it replaced, and the floor goes with the wait', async () => {
        await loadFree();
        vi.spyOn(one('availability'), 'getBoundingClientRect').mockReturnValue({
          height: 76.5,
        } as DOMRect);

        pickDays(otherDay);
        await settle();
        expect(one('availability').style.minHeight).toBe('76.5px');

        venueReq().flush(freeBeach());
        await settle();
        expect(one('availability').style.minHeight).toBe('');
      });

      it('carries the count’s empty twin and holds the mark’s slot from the start of the wait', async () => {
        await loadFree();
        expect(markSlot()).toBeNull();

        pickDays(otherDay);
        await settle();

        expect(twin()!.classList).toContain('text-[19px]');
        expect(twin()!.getAttribute('aria-hidden')).toBe('true');
        expect(twin()!.textContent).toBe('');
        expect(markSlot()!.getAttribute('aria-hidden')).toBe('true');
        expect(markSlot()!.childElementCount).toBe(0);
        venueReq().flush(freeBeach());
        await settle();
        expect(markSlot()).toBeNull();
      });

      it('has no twin when the line it replaced showed no count', async () => {
        await mount({});
        venueReq().flush(venue(1, []));
        await settle();
        expect(line()).toBe('No sets to book yet');

        pickDays(otherDay);
        await settle();

        expect(line()).toBe(`Checking availability for ${dayLabel(otherDay)}…`);
        expect(twin()).toBeNull();
        venueReq().flush(venue(1, []));
      });
    });

    describe('the progress mark', () => {
      const mark = (): HTMLElement | null =>
        dom().querySelector('[data-testid="availability-wait"]');

      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      });

      afterEach(() => {
        freezeClock();
      });

      it('appears only once the wait passes a second, outside the live region', async () => {
        await loadFree();
        pickDays(otherDay);
        await settle();
        expect(mark()).toBeNull();

        vi.advanceTimersByTime(999);
        await settle();
        expect(mark()).toBeNull();

        vi.advanceTimersByTime(1);
        await settle();
        expect(mark()).not.toBeNull();
        expect(mark()!.getAttribute('aria-hidden')).toBe('true');
        expect(one('availability').contains(mark())).toBe(false);
        expect(line()).toBe(`Checking availability for ${dayLabel(otherDay)}…`);
        venueReq().flush(freeBeach());
      });

      it('goes when the read answers', async () => {
        await loadFree();
        pickDays(otherDay);
        await settle();
        vi.advanceTimersByTime(1000);
        await settle();

        venueReq().flush(freeBeach());
        await settle();

        expect(mark()).toBeNull();
      });

      it('never appears for a read answered within the second, nor after it', async () => {
        await loadFree();
        pickDays(otherDay);
        await settle();
        vi.advanceTimersByTime(400);
        venueReq().flush(freeBeach());
        await settle();

        vi.advanceTimersByTime(5000);
        await settle();

        expect(mark()).toBeNull();
      });

      it('is not shown by a same-days re-read, however long', async () => {
        await loadFree();
        (fixture.componentInstance as unknown as { retry(): void }).retry();
        await settle();

        vi.advanceTimersByTime(5000);
        await settle();

        expect(mark()).toBeNull();
        venueReq().flush(freeBeach());
      });
    });

    it('moves focus without scrolling the page away from the map', async () => {
      await loadFree();
      tile(2).focus();
      const focus = vi.spyOn(one('map-date'), 'focus');

      pickDays(otherDay);
      await settle();

      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      venueReq().flush(freeBeach());
    });

    it('shortening to the days already shown re-reads nothing and arms no dialog for a later read', async () => {
      await loadNoCover();
      await tap(tile(1));
      (
        fixture.componentInstance as unknown as {
          shortenTo(set: SetView, days: { first: string; last: string }): void;
        }
      ).shortenTo(noCoverBeach().sets[0], { first, last });
      await settle();

      expect(dom().querySelector('app-partly-free-sheet')).toBeNull();
      expect(document.activeElement).toBe(tile(1));

      // A later re-read that finds the set free must not open a dialog nobody asked for.
      (fixture.componentInstance as unknown as { retry(): void }).retry();
      venueReq().flush(freeBeach());
      await settle();
      expect(dom().querySelector('app-booking-dialog')).toBeNull();
    });

    it('opens no dialog over a calendar the visitor opened while the shortened stay loaded', async () => {
      await loadNoCover();
      await tap(tile(1));
      await tap(one('shorten-stay'));
      await tap(one('map-date'));
      expect(dom().querySelector('app-availability-calendar')).not.toBeNull();

      venueReq().flush(freeBeach());
      await settle();

      expect(dom().querySelector('app-booking-dialog')).toBeNull();
      expect(dom().querySelector('app-availability-calendar')).not.toBeNull();
    });

    it('drops its reads with the page, so a late answer moves no focus on a destroyed view', async () => {
      await loadNoCover();
      await tap(one('no-cover-plan'));
      (fixture.componentInstance as unknown as { planAround(set: SetView): void }).planAround(
        noCoverBeach().sets[0],
      );
      const plan = itineraryReq();
      pickDays(otherDay, addDays(otherDay, 2));
      const map = venueReq();

      fixture.destroy();

      expect(plan.cancelled).toBe(true);
      expect(map.cancelled).toBe(true);
    });

    it('leaves focus the visitor moved on while the shortened stay loaded', async () => {
      await loadNoCover();
      await tap(tile(1));
      await tap(one('shorten-stay'));
      one('venue-back').focus();

      venueReq().flush(noCoverBeach());
      await settle();
      itineraryReq().flush(stitched());
      await settle();

      expect(document.activeElement).toBe(one('venue-back'));
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
