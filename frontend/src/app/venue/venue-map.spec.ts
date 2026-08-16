import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
import { formatBookingDate } from '../shared/booking-date-label';
import { defaultBookingDate } from '../shared/booking-date';
import { SetView, VenueMapView } from '../shared/venue-views';
import { rowCode, VenueMap } from './venue-map';

/** A 24-set fixture mirroring the Miramar seed: 4 rows × 6, 6 taken (18 free), front row premium.
 *  Rows 2+3 share a price (€35) so the per-zone price rendering (#672) is observable. */
function miramar(): VenueMapView {
  const rows: readonly {
    label: string;
    tier: SetView['tier'];
    pool: SetView['pool'];
    price: number;
    gridY: number;
    taken: readonly boolean[];
  }[] = [
    {
      label: 'Front row · Sea view',
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: 4500,
      gridY: 1,
      taken: [true, false, false, true, false, false],
    },
    {
      label: 'Row 2',
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: 3500,
      gridY: 2,
      taken: [false, false, true, false, false, false],
    },
    {
      label: 'Row 3',
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: 3500,
      gridY: 3,
      taken: [false, true, false, false, false, true],
    },
    {
      label: 'Row 4 · Back',
      tier: 'STANDARD',
      pool: 'WALK_IN',
      price: 2500,
      gridY: 4,
      taken: [false, false, false, true, false, false],
    },
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
    // Amenities out of catalogue order → the header renders the FULL row catalogue-ordered (Beach bar, Free parking, WiFi); plus a to-water distance.
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

  /** Match the venue request on path only (a `?date=` param is appended). */
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
    // The service resolves the wire's root-relative path against the API origin.
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

  it('cycles the banner slideshow through every occupied slot with its own controls', async () => {
    venueRequest().flush({
      ...miramar(),
      photos: [
        '/api/venues/1/photos/bb02',
        '/api/venues/1/photos/cc03',
        '/api/venues/1/photos/dd04',
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const band = el().querySelector('.photo-band')!;
    const slides = band.querySelectorAll<HTMLImageElement>(
      '[data-testid="map-banner-img"], [data-testid="map-banner-slide-img"]',
    );
    expect(slides.length).toBe(3);
    // The service resolves each wire path against the API origin.
    expect(slides[0].getAttribute('src')).toBe(
      `${environment.apiBaseUrl}/api/venues/1/photos/bb02`,
    );
    expect(band.querySelectorAll('[data-testid="map-banner-dots"] span').length).toBe(3);

    // The band hosts its own labelled controls (it is no link), outside the aria-hidden imagery.
    const next = band.querySelector<HTMLButtonElement>('[data-testid="map-banner-next"]')!;
    expect(next.getAttribute('aria-label')).toBe('Next photo, Miramar Beach Club');
    expect(next.closest('[aria-hidden="true"]')).toBeNull();

    next.click();
    fixture.detectChanges();
    expect(slides[0].classList.contains('opacity-0')).toBe(true);
    expect(slides[1].classList.contains('opacity-0')).toBe(false);
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

  it('renders rows with derived A/B/… codes in insertion order', async () => {
    flushVenue();
    await fixture.whenStable();
    const codes = [...el().querySelectorAll('[data-testid="row-code"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(codes).toEqual(['A', 'B', 'C', 'D']); // insertion order, not sorted by the descriptive label
  });

  it('renders the price once per price zone, not per row (#672)', async () => {
    flushVenue();
    await fixture.whenStable();
    const prices = [...el().querySelectorAll('[data-testid="row-price"]')].map((n) =>
      n.textContent?.trim(),
    );
    // Rows B and C share €35 — one zone, one chip: 4 rows render 3 chips, from minor units.
    expect(prices).toEqual(['€45', '€35', '€25']);
  });

  it('separates price zones with a gap at zone starts, aligned across all three columns (#672)', async () => {
    flushVenue();
    await fixture.whenStable();
    // A opens the map (no gap), B opens the €35 zone, C continues it, D opens the €25 zone.
    const zoneGaps = [false, true, false, true];
    // The gap sits on the canvas-owned row wrapper around each projected ul.set-row (#672 slice 2).
    const tileRows = [...el().querySelectorAll('[data-map-row]')];
    expect(tileRows.length).toBe(4);
    expect(tileRows.map((r) => r.classList.contains('mt-3'))).toEqual(zoneGaps);
    const codeCells = [...el().querySelectorAll('[data-testid="row-code"]')].map(
      (n) => n.parentElement!,
    );
    expect(codeCells.map((c) => c.classList.contains('mt-3'))).toEqual(zoneGaps);
    const priceColumn = el().querySelector('[data-testid="price-col"]')!;
    const priceCells = [...priceColumn.children];
    expect(priceCells.map((c) => c.classList.contains('mt-3'))).toEqual(zoneGaps);
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

  it('gives free walk-in sets their own treatment: sand tile, no button, walk-in-only name (#672)', async () => {
    flushVenue();
    await fixture.whenStable();
    const walkins = [...el().querySelectorAll('.set-tile.walkin')];
    expect(walkins.length).toBe(5); // row D is the walk-in pool: 6 sets, 1 taken
    expect(walkins[0].querySelector('button')).toBeNull();
    const label = walkins[0].getAttribute('aria-label') ?? '';
    expect(label).toContain('walk-in only — book at the venue');
    expect(label).not.toContain('available');
  });

  it('renders a taken walk-in set as taken, not walk-in — the ghost wins (#672)', async () => {
    flushVenue();
    await fixture.whenStable();
    const d4 = [...el().querySelectorAll('.set-tile')].find((t) =>
      t.getAttribute('aria-label')?.startsWith('Set D4'),
    )!;
    expect(d4.classList.contains('taken')).toBe(true);
    expect(d4.classList.contains('walkin')).toBe(false);
    expect(d4.getAttribute('aria-label')).toContain('taken');
  });

  it('lists a walk-in entry in the legend, next to the restyled swatches (#672)', async () => {
    flushVenue();
    await fixture.whenStable();
    const legend = el().querySelector('ul[aria-label="Legend"]')!;
    expect(legend.textContent).toContain('Walk-in only');
    expect(legend.querySelectorAll('li').length).toBe(4); // Available · Front row · Walk-in · Taken
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

  it('keeps the white date field light-scheme under the dark riviera document (#675)', async () => {
    flushVenue();
    await fixture.whenStable();
    const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
    // Class pin (jsdom computes no Tailwind CSS); the computed proof is theme-shell.e2e.ts AC-2.
    expect(input.classList.contains('scheme-light')).toBe(true);
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

  /** Drag the shared canvas's pan viewport 40px (> the 6px threshold) via real DOM events. */
  function pan(): void {
    const vp = el().querySelector<HTMLElement>('[data-testid="map-pan"]')!;
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0 }));
    vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40 }));
    vp.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }
  function clickFreeButton(detail: number): void {
    el()
      .querySelector<HTMLButtonElement>('.set-button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
  }

  it('does not open the dialog when a drag-pan (not a tap) mouse-releases over a tile', async () => {
    flushVenue();
    await fixture.whenStable();

    pan();
    clickFreeButton(1); // the mouse click that follows a pan-release (detail > 0)
    await fixture.whenStable();
    expect(el().querySelector('app-booking-dialog')).toBeNull();

    clickFreeButton(1); // a genuine mouse tap afterwards still opens the dialog
    await fixture.whenStable();
    expect(el().querySelector('app-booking-dialog')).not.toBeNull();
  });

  it('does NOT swallow a keyboard activation after a pan that ended off a tile (a11y)', async () => {
    flushVenue();
    await fixture.whenStable();

    pan(); // a pan whose release fired no consuming click (ended off a button) — flag lingers
    clickFreeButton(0); // tab to a tile, press Enter (detail 0) → must open, not be swallowed
    await fixture.whenStable();
    expect(el().querySelector('app-booking-dialog')).not.toBeNull();
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

    // A value guard (id === 1) would re-admit `firstVisit`; the epoch identity guard must not.
    detour.flush({ ...miramar(), id: 2, name: 'Riviera Blue' });
    firstVisit.flush({ ...miramar(), name: 'Stale Miramar' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(0);

    venueRequest().flush(miramar());
    await fixture.whenStable();
    expect(el().querySelector('header')?.textContent).toContain('Miramar Beach Club');
  });

  it('drops a stale same-date response from before a picker round trip (#499, the #487 class)', async () => {
    const first = venueRequest(); // the initial date-A load, never settled before the round trip
    await fixture.whenStable();

    const c = fixture.componentInstance as unknown as { onDateChange(e: Event): void };
    const dateB = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    c.onDateChange({ target: { value: dateB } } as unknown as Event);
    const detour = venueRequest();
    c.onDateChange({ target: { value: defaultBookingDate(new Date()) } } as unknown as Event);
    const fresh = venueRequest();

    fresh.error(new ProgressEvent('error'));
    detour.flush(miramar());
    // Same venue, same date as `fresh` — only a per-DISPATCH generation tells this stale success from the freshest attempt's failure; it must not resurrect the map.
    first.flush(miramar());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="map-error"]')).not.toBeNull();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(0);
  });

  it('re-derives the booking floor at an in-place switch after midnight (#499, invariant #4)', async () => {
    flushVenue();
    await fixture.whenStable();

    const frozen = new Date();
    vi.setSystemTime(new Date(frozen.getTime() + 3 * 24 * 60 * 60 * 1000));
    try {
      params$.next(convertToParamMap({ id: '2' }));
      await fixture.whenStable();
      // The reset must clamp to the CURRENT tomorrow, not the construction-time floor.
      const req = venueRequest(2);
      expect(req.request.params.get('date')).toBe(defaultBookingDate(new Date()));
      req.flush({ ...miramar(), id: 2 });
      await fixture.whenStable();
      fixture.detectChanges();
      const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
      expect(input.getAttribute('min')).toBe(defaultBookingDate(new Date()));
    } finally {
      vi.setSystemTime(frozen);
    }
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

    // The dialog now shows the map's date read-only (the map owns the date) — assert the formatted date display instead of an editable input.
    const dialogDate = el().querySelector('app-booking-dialog [data-testid="dialog-date"]');
    expect(dialogDate?.textContent).toContain(formatBookingDate(chosen));
  });
});

/**
 * The venue map seeds its date from the `?date=` query param the discovery page carries when a
 * venue is opened, so the tourist's chosen date persists across the hop. The param is
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
