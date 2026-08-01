import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { formatBookingDate } from '../shared/booking-date-label';
import { defaultBookingDate } from '../shared/booking-date';
import { SetView, VenueMapView } from '../shared/venue-views';
import { rowCode, VenueMap } from './venue-map';

/** A 24-set fixture mirroring the Miramar seed: 4 rows × 6, 6 taken (18 free), front row premium. */
function miramar(): VenueMapView {
  const rows: readonly {
    label: string;
    tier: SetView['tier'];
    pool: SetView['pool'];
    price: number;
    gridY: number;
    taken: readonly boolean[];
  }[] = [
    { label: 'Front row · Sea view', tier: 'PREMIUM', pool: 'ONLINE', price: 4500, gridY: 1, taken: [true, false, false, true, false, false] },
    { label: 'Row 2', tier: 'STANDARD', pool: 'ONLINE', price: 3500, gridY: 2, taken: [false, false, true, false, false, false] },
    { label: 'Row 3', tier: 'STANDARD', pool: 'ONLINE', price: 3000, gridY: 3, taken: [false, true, false, false, false, true] },
    { label: 'Row 4 · Back', tier: 'STANDARD', pool: 'WALK_IN', price: 2500, gridY: 4, taken: [false, false, false, true, false, false] },
  ];
  let id = 0;
  const sets: SetView[] = rows.flatMap((row) =>
    row.taken.map((isTaken, i) => ({
      id: ++id,
      rowLabel: row.label,
      positionNo: i + 1,
      tier: row.tier,
      pool: row.pool,
      price: { minorUnits: row.price, currency: 'EUR' },
      gridX: i + 1,
      gridY: row.gridY,
      availability: isTaken ? 'TAKEN' : 'FREE',
    })),
  );
  return {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: 'Premium loungers on the Ksamil shoreline.',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    // Amenities out of catalogue order (T7 #140) → the header renders the FULL row catalogue-ordered
    // (Beach bar, Free parking, WiFi); plus a to-water distance.
    amenities: ['WIFI', 'BEACH_BAR', 'FREE_PARKING'],
    distanceToWaterM: 8,
    sets,
  };
}

describe('rowCode', () => {
  it('derives A…Z then AA after Z by insertion index (no lexicographic sort)', () => {
    expect(rowCode(0)).toBe('A');
    expect(rowCode(25)).toBe('Z');
    expect(rowCode(26)).toBe('AA'); // AA follows Z; a string sort would put it before B
    expect(rowCode(27)).toBe('AB');
  });
});

describe('VenueMap', () => {
  let fixture: ComponentFixture<VenueMap>;
  let httpMock: HttpTestingController;
  let params$: BehaviorSubject<ParamMap>;
  let queryParams$: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    params$ = new BehaviorSubject(convertToParamMap({ id: '1' }));
    queryParams$ = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({
      imports: [VenueMap],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
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
  });

  afterEach(() => httpMock.verify());

  /** Match the venue request on path only (a `?date=` param is appended — issue #44). */
  function venueRequest(id = 1): TestRequest {
    return httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues/${id}`);
  }

  function flushVenue(): void {
    venueRequest().flush(miramar());
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('requests the venue from the route id', () => {
    flushVenue();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders 24 positioned tiles', async () => {
    flushVenue();
    await fixture.whenStable();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(24);
  });

  it('renders the cover banner photo when present, keeping the scrim; no "coming soon" pill either way (#142)', async () => {
    venueRequest().flush({
      ...miramar(),
      coverPhoto: { card: '/api/venues/1/photos/aa01', banner: '/api/venues/1/photos/bb02' },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const img = el().querySelector<HTMLImageElement>('[data-testid="map-banner-img"]');
    // The service resolves the wire's root-relative path against the API origin (F-7).
    expect(img?.getAttribute('src')).toBe(`${environment.apiBaseUrl}/api/venues/1/photos/bb02`);
    // The scrim stays layered over the photo band, and the retired pill never renders.
    expect(el().querySelector('.photo-band')?.innerHTML).toContain('riv-photo-scrim');
    expect(el().textContent).not.toContain('coming soon');
  });

  it('falls back to the bare gradient band without the pill when there is no cover photo (#142)', async () => {
    flushVenue(); // the fixture has no coverPhoto
    await fixture.whenStable();

    expect(el().querySelector('[data-testid="map-banner-img"]')).toBeNull();
    expect(el().querySelector('.photo-band')).toBeTruthy();
    expect(el().textContent).not.toContain('coming soon');
  });

  it('marks the premium front row and the taken sets distinctly', async () => {
    flushVenue();
    await fixture.whenStable();
    expect(el().querySelectorAll('.set-tile.premium').length).toBe(6); // front row
    expect(el().querySelectorAll('.set-tile.taken').length).toBe(6); // 18 of 24 free
  });

  it('shows the availability summary "18 of 24"', async () => {
    flushVenue();
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="availability"]')?.textContent).toContain('18 of 24');
  });

  it('shows the rating and review count for a rated venue', async () => {
    flushVenue();
    await fixture.whenStable();
    const header = el().querySelector('header')!;
    expect(header.textContent).toContain('4.8');
    expect(header.textContent).toContain('326 reviews');
    expect(header.querySelector('[data-testid="new-chip"]')).toBeNull();
  });

  it('renders a "New" pill (aria "No reviews yet", no ★ 0.0) for an unrated venue (#154)', async () => {
    venueRequest().flush({ ...miramar(), name: 'Miramare', ratingTenths: 0, reviewsCount: 0 });
    await fixture.whenStable();

    const header = el().querySelector('header')!;
    const chip = header.querySelector('[data-testid="new-chip"]')!;
    expect(chip.textContent).toContain('New');
    expect(chip.getAttribute('aria-label')).toBe('No reviews yet');
    expect(header.textContent).not.toContain('0.0');
    expect(header.textContent).not.toContain('0 reviews');
  });

  it('renders rows with derived A/B/… codes in insertion order and per-row price from minor units', async () => {
    flushVenue();
    await fixture.whenStable();
    const codes = [...el().querySelectorAll('[data-testid="row-code"]')].map((n) => n.textContent?.trim());
    expect(codes).toEqual(['A', 'B', 'C', 'D']); // insertion order, not sorted by the descriptive label
    const prices = [...el().querySelectorAll('[data-testid="row-price"]')].map((n) => n.textContent?.trim());
    expect(prices[0]).toBe('€45'); // row A, 4500 minor units
    expect(prices[3]).toBe('€25'); // row D, 2500 minor units
  });

  it('renders the venue description in the header', async () => {
    flushVenue();
    await fixture.whenStable();
    expect(el().querySelector('.description')?.textContent).toContain(
      'Premium loungers on the Ksamil shoreline.',
    );
  });

  it('renders the full amenity row + a to-water chip on the map header (catalogue order)', async () => {
    flushVenue();
    await fixture.whenStable();
    const chips = el().querySelector('[data-testid="venue-chips"]')!;
    const texts = [...chips.querySelectorAll('.amenity-chip')].map((c) => c.textContent?.trim());
    // To-water first, then ALL amenities in canonical catalogue order (no ≤3 cap on the map).
    expect(texts).toEqual(['8m to water', 'Beach bar', 'Free parking', 'WiFi']);
  });

  it('gives each tile an accessible name carrying its seat, descriptive row and state (not colour-only)', async () => {
    flushVenue();
    await fixture.whenStable();
    const firstTile = el().querySelector('[data-testid="set-tile"]'); // A1 — taken, so the <li> carries the name
    expect(firstTile?.getAttribute('aria-label')).toContain('Set A1');
    expect(firstTile?.getAttribute('aria-label')).toContain('Front row · Sea view');
    expect(firstTile?.getAttribute('aria-label')).toContain('taken');
  });

  it('exposes a booking button only for free online sets', async () => {
    flushVenue();
    await fixture.whenStable();
    // Free ONLINE sets are bookable buttons; taken and walk-in sets are not interactive.
    expect(el().querySelectorAll('.set-button').length).toBeGreaterThan(0);
    expect(el().querySelector('.set-tile.taken')?.querySelector('button')).toBeNull();
  });

  it('keeps the bookable button accessible name ending in "Select to book"', async () => {
    flushVenue();
    await fixture.whenStable();
    const label = el().querySelector('.set-button')?.getAttribute('aria-label');
    expect(label).toContain('Select to book'); // pinned so booking-flow.e2e.ts keeps matching
  });

  it('renders the cutoff explainer and sets the date-picker min to tomorrow (today not offered)', async () => {
    flushVenue();
    await fixture.whenStable();
    const note = el().querySelector('[data-testid="cutoff-note"]');
    // \s matches the non-breaking space in "6 PM", so the copy reads plainly here.
    expect(note?.textContent).toMatch(/book by 6\s+PM the day before/i);
    const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
    expect(input.getAttribute('min')).toBe(defaultBookingDate(new Date())); // tomorrow, Europe/Tirane
  });

  it('opens the booking dialog when a free set is activated, and closes it on dismiss', async () => {
    flushVenue();
    await fixture.whenStable();

    el().querySelector<HTMLButtonElement>('.set-button')!.click();
    await fixture.whenStable();
    expect(el().querySelector('app-booking-dialog')).not.toBeNull();

    (fixture.componentInstance as unknown as { onDialogClose(): void }).onDialogClose();
    await fixture.whenStable();
    expect(el().querySelector('app-booking-dialog')).toBeNull();
  });

  interface PanHarness {
    onMapMouseDown(e: MouseEvent): void;
    onMapMouseMove(e: MouseEvent): void;
    onMapMouseUp(): void;
    select(s: SetView, e?: Event): void;
    selectedSet(): SetView | undefined;
    venue(): VenueMapView;
  }
  function pan(c: PanHarness): void {
    const scroller = { scrollLeft: 0 } as HTMLElement;
    c.onMapMouseDown({ clientX: 0, currentTarget: scroller } as unknown as MouseEvent);
    c.onMapMouseMove({ clientX: 40, currentTarget: scroller } as unknown as MouseEvent); // 40px > 6px → pan
    c.onMapMouseUp();
  }
  const mouseClick = { detail: 1 } as MouseEvent; // a pointer click carries detail > 0
  const keyActivation = { detail: 0 } as MouseEvent; // Enter/Space fires a click with detail 0

  it('does not open the dialog when a drag-pan (not a tap) mouse-releases over a tile', async () => {
    flushVenue();
    await fixture.whenStable();
    const c = fixture.componentInstance as unknown as PanHarness;
    const free = c.venue().sets.find((s) => s.availability === 'FREE' && s.pool === 'ONLINE')!;

    pan(c);
    c.select(free, mouseClick); // the mouse click that follows a pan-release
    expect(c.selectedSet()).toBeUndefined();
    c.select(free, mouseClick); // a genuine mouse tap afterwards still opens the dialog
    expect(c.selectedSet()).toBe(free);
  });

  it('does NOT swallow a keyboard activation after a pan that ended off a tile (a11y)', async () => {
    flushVenue();
    await fixture.whenStable();
    const c = fixture.componentInstance as unknown as PanHarness;
    const free = c.venue().sets.find((s) => s.availability === 'FREE' && s.pool === 'ONLINE')!;

    pan(c); // a pan whose release fired no consuming click (ended off a button) — flag lingers
    c.select(free, keyActivation); // tab to a tile, press Enter → must open, not be swallowed
    expect(c.selectedSet()).toBe(free);
  });

  it('shows the designed failure panel (alert semantics + retry) and recovers on Retry', async () => {
    venueRequest().error(new ProgressEvent('error'));
    await fixture.whenStable();

    const panel = el().querySelector('[data-testid="map-error"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('alert');
    expect(panel?.querySelector('.failure-title')?.textContent).toContain('load this beach map');

    el().querySelector<HTMLButtonElement>('[data-testid="map-retry"]')!.click();
    await fixture.whenStable();
    venueRequest().flush(miramar());
    await fixture.whenStable();

    expect(el().querySelector('[data-testid="map-error"]')).toBeNull();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(24);
  });

  it('navigates back to discovery when the back pill is pressed', async () => {
    flushVenue();
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    el().querySelector<HTMLButtonElement>('.back-pill')!.click();

    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('navigates to the confirmation when the dialog reports a booking', async () => {
    flushVenue();
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (fixture.componentInstance as unknown as { onBooked(): void }).onBooked();

    expect(navigate).toHaveBeenCalledWith(['/booking/confirmation']);
  });

  it('navigates to the payment page when the dialog reports awaiting payment (stripe)', async () => {
    flushVenue();
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (fixture.componentInstance as unknown as { onAwaiting(): void }).onAwaiting();

    expect(navigate).toHaveBeenCalledWith(['/booking/pay']);
  });

  it('requests the venue for tomorrow in Europe/Tirane by default', () => {
    const req = venueRequest();
    expect(req.request.params.get('date')).toBe(defaultBookingDate(new Date()));
    req.flush(miramar());
  });

  it('re-fetches availability for a newly chosen date', async () => {
    flushVenue();
    await fixture.whenStable();

    // A date guaranteed to differ from the component's default (tomorrow) on ANY calendar day —
    // a hardcoded date that happens to equal "tomorrow" fires no change event (the 2026-07-14
    // flake). Derived like the component derives its own default, a week out.
    const chosen = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
    input.value = chosen;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const req = venueRequest();
    expect(req.request.params.get('date')).toBe(chosen);
    req.flush(miramar());
  });

  it('re-loads and resets when the venue param changes in place (#499)', async () => {
    flushVenue();
    await fixture.whenStable();
    el().querySelector<HTMLButtonElement>('.set-button')!.click();
    await fixture.whenStable();
    expect(el().querySelector('app-booking-dialog')).not.toBeNull();

    params$.next(convertToParamMap({ id: '2' }));
    await fixture.whenStable();
    fixture.detectChanges();

    // Fresh-mount state: the dialog is closed and venue 1's map no longer renders while loading.
    expect(el().querySelector('app-booking-dialog')).toBeNull();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(0);
    venueRequest(2).flush({ ...miramar(), id: 2, name: 'Riviera Blue' });
    await fixture.whenStable();
    expect(el().querySelector('header')?.textContent).toContain('Riviera Blue');
  });

  it("drops a superseded venue's late response (#499)", async () => {
    const stale = venueRequest(); // venue 1's load, still in flight at the switch
    params$.next(convertToParamMap({ id: '2' }));
    await fixture.whenStable();

    stale.flush(miramar());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(0);

    venueRequest(2).flush({ ...miramar(), id: 2, name: 'Riviera Blue' });
    await fixture.whenStable();
    expect(el().querySelector('header')?.textContent).toContain('Riviera Blue');
  });

  it('drops a stale first-visit response after an A→B→A switch (#499)', async () => {
    const firstVisit = venueRequest(); // venue 1's first load, never answered before the round trip
    params$.next(convertToParamMap({ id: '2' }));
    await fixture.whenStable();
    const detour = venueRequest(2);
    params$.next(convertToParamMap({ id: '1' }));
    await fixture.whenStable();

    // Both superseded responses land AFTER the return to venue 1 — a value guard (id === 1)
    // would re-admit the first one; the epoch identity guard must not (#487 class).
    detour.flush({ ...miramar(), id: 2, name: 'Riviera Blue' });
    firstVisit.flush({ ...miramar(), name: 'Stale Miramar' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(0);

    venueRequest().flush(miramar());
    await fixture.whenStable();
    expect(el().querySelector('header')?.textContent).toContain('Miramar Beach Club');
  });

  it('re-seeds the date from the ?date param on an in-place navigation (#499)', async () => {
    flushVenue();
    await fixture.whenStable();

    const carried = defaultBookingDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    queryParams$.next(convertToParamMap({ date: carried }));
    await fixture.whenStable();

    const req = venueRequest();
    expect(req.request.params.get('date')).toBe(carried);
    req.flush(miramar());
    await fixture.whenStable();
    fixture.detectChanges();
    const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
    expect(input.value).toBe(carried);
  });

  it('clamps an in-place ?date below the booking floor back to it (#499, invariant #4)', async () => {
    flushVenue();
    await fixture.whenStable();
    // Move off the floor first so the clamped fallback is an observable change.
    const carried = defaultBookingDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    queryParams$.next(convertToParamMap({ date: carried }));
    await fixture.whenStable();
    venueRequest().flush(miramar());

    queryParams$.next(convertToParamMap({ date: '2020-01-01' }));
    await fixture.whenStable();
    const req = venueRequest();
    expect(req.request.params.get('date')).toBe(defaultBookingDate(new Date()));
    req.flush(miramar());
  });

  it('fails fast when the param turns invalid and recovers on a valid id (#499)', async () => {
    flushVenue();
    await fixture.whenStable();

    params$.next(convertToParamMap({ id: 'abc' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="map-error"]')).not.toBeNull();

    params$.next(convertToParamMap({ id: '3' }));
    await fixture.whenStable();
    venueRequest(3).flush({ ...miramar(), id: 3 });
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="map-error"]')).toBeNull();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(24);
  });

  it('opens the booking dialog pre-set to the map’s selected date', async () => {
    flushVenue();
    await fixture.whenStable();

    // Derived a week out, never hardcoded — a date equal to the component's default (tomorrow)
    // fires no change event and no re-fetch (the 2026-07-14 flake class).
    const chosen = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
    input.value = chosen;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    venueRequest().flush(miramar()); // settle the re-fetch

    await fixture.whenStable();
    el().querySelector<HTMLButtonElement>('.set-button')!.click();
    await fixture.whenStable();

    // The dialog now shows the map's date read-only (the map owns the date, #44/#136) — assert the
    // formatted date display instead of an editable input.
    const dialogDate = el().querySelector('app-booking-dialog [data-testid="dialog-date"]');
    expect(dialogDate?.textContent).toContain(formatBookingDate(chosen));
  });
});

/**
 * The venue map seeds its date from the `?date=` query param the discovery page carries when a
 * venue is opened (#294), so the tourist's chosen date persists across the hop. The param is
 * validated (well-formed ISO calendar date) and clamped to the map's floor (tomorrow, invariant #4);
 * an absent or malformed value falls back to the default. Each case needs its own ActivatedRoute, so
 * this block configures TestBed per test rather than sharing the suite's beforeEach.
 */
describe('VenueMap — date carried from the discovery page (#294)', () => {
  let fixture: ComponentFixture<VenueMap>;
  let httpMock: HttpTestingController;

  async function setup(queryParams: Record<string, string>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [VenueMap],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: '1' }),
              queryParamMap: convertToParamMap(queryParams),
            },
            paramMap: new BehaviorSubject(convertToParamMap({ id: '1' })),
            queryParamMap: new BehaviorSubject(convertToParamMap(queryParams)),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VenueMap);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  function venueReq(): TestRequest {
    return httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues/1`);
  }

  it('seeds the map date from a valid ?date= param and requests that date', async () => {
    const chosen = defaultBookingDate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
    await setup({ date: chosen });

    const req = venueReq();
    expect(req.request.params.get('date')).toBe(chosen);
    req.flush(miramar());
    await fixture.whenStable();

    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="map-date"]',
    )!;
    expect(input.value).toBe(chosen); // the picker shows the carried date, not the default
  });

  it('clamps a past ?date= param up to the earliest bookable day (invariant #4)', async () => {
    await setup({ date: '2020-01-01' });
    const req = venueReq();
    expect(req.request.params.get('date')).toBe(defaultBookingDate(new Date()));
    req.flush(miramar());
  });

  it('ignores a malformed ?date= param, falling back to tomorrow', async () => {
    await setup({ date: 'not-a-date' });
    const req = venueReq();
    expect(req.request.params.get('date')).toBe(defaultBookingDate(new Date()));
    req.flush(miramar());
  });
});
