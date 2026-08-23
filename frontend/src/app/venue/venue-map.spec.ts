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
import { uniformDays } from '../../testing/calendar-days';
import { expectCellsFillCanvasRow } from '../../testing/beach-map-height';
import { formatBookingDate } from '../shared/booking-date-label';
import { defaultBookingDate, formatCivilDate, todayBookingDate } from '../shared/booking-date';
import { SetView, VenueMapView } from '../shared/venue-views';
import { VenueMap } from './venue-map';

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

/** A tourist-visible venue whose operator has not drawn a layout yet: zero sets and so a
 *  `null` from-price, exactly the shape `JdbcVenueCatalog` serves for an unpublished map. */
function mapless(): VenueMapView {
  return { ...miramar(), sets: [], fromPrice: null };
}

/** The same venue in Request-to-Book mode — the map footer is the one surface that branches on it. */
function requestMode(): VenueMapView {
  return { ...miramar(), bookingMode: 'REQUEST' };
}

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

  function flushMapless(): void {
    venueRequest().flush(mapless());
  }

  function flushRequestVenue(): void {
    venueRequest().flush(requestMode());
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The calendar popover's trigger — a button since #761, not the old native date input. */
  function dateTrigger(): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>('[data-testid="map-date"]')!;
  }

  /** Answer whatever calendar window the popover asked for, so `httpMock.verify()` stays happy. */
  function flushCalendar(request?: TestRequest): void {
    const pending =
      request ?? httpMock.expectOne((req) => req.url.endsWith('/availability-calendar'));
    pending.flush(
      uniformDays(pending.request.params.get('from')!, pending.request.params.get('to')!),
    );
  }

  /** Open the calendar and settle its month read. */
  async function openPicker(): Promise<void> {
    fixture.detectChanges();
    dateTrigger().click();
    fixture.detectChanges();
    await fixture.whenStable();
    flushCalendar();
    fixture.detectChanges();
  }

  /**
   * One day cell of the OPEN calendar. Scoped to the popover on purpose: the trigger carries a
   * `data-date` too, and it precedes the popover in the document, so an unscoped query silently
   * returns the trigger whenever the two dates coincide — which is exactly the case a floor
   * assertion tests.
   */
  function calendarDay(iso: string): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>(
      `[data-testid="availability-calendar"] button[data-date="${iso}"]`,
    )!;
  }

  /** Choose `iso` from the open calendar (the picker closes and the map re-fetches). */
  function pickDay(iso: string): void {
    calendarDay(iso).click();
    fixture.detectChanges();
  }

  /** The colour classes the directive gives a state, read off the legend swatch wearing it. */
  function appearanceClassesFor(state: string): string[] {
    const swatch = el().querySelector(`ul[aria-label="Legend"] [data-state="${state}"]`)!;
    const geometry = new Set(['h-[18px]', 'w-[18px]', 'rounded-[6px]', 'border-[1.5px]']);
    return [...swatch.classList].filter((token) => !geometry.has(token));
  }

  it('announces through one region that survives loading → loaded (#741)', () => {
    fixture.detectChanges();
    const announcer = el().querySelector('[data-testid="load-announcer"]')!;
    expect(announcer.textContent?.trim()).toBe('Loading the beach map…');
    // The visible copy is decoration; the announcer alone carries the words.
    expect(el().querySelector('[data-testid="map-loading"]')!.getAttribute('aria-hidden')).toBe(
      'true',
    );

    flushVenue();
    fixture.detectChanges();

    // Same node, mutated text. The availability count region is rebuilt, so it cannot do this.
    expect(el().querySelector('[data-testid="load-announcer"]')).toBe(announcer);
    expect(announcer.textContent?.trim()).toBe('Beach map loaded.');
  });

  it('renders a skeleton mirroring the loaded map while the read is in flight (#744)', () => {
    fixture.detectChanges();

    const loading = el().querySelector('[data-testid="map-loading"]')!;
    expect(loading.querySelector('[data-testid="map-skeleton-header"]')).not.toBeNull();
    expect(loading.querySelector('[data-testid="map-skeleton-overview"]')).not.toBeNull();
    expect(loading.querySelectorAll('[data-testid="map-skeleton-tile"]').length).toBeGreaterThan(0);
    // The sentence the skeleton replaces; a mirrored shape says it without a reflow (#744).
    expect(loading.textContent).not.toContain('Loading the beach map');

    flushVenue();
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="map-loading"]')).toBeNull();
    expect(el().querySelector('[data-testid="map-skeleton-tile"]')).toBeNull();
  });

  it('reserves the price rail on both canvases, so the tile viewport holds its width (#751)', async () => {
    fixture.detectChanges();

    const placeholder = el().querySelector('[data-testid="price-col-placeholder"]')!;
    expect(placeholder.classList.contains('min-w-[92px]')).toBe(true);

    flushVenue();
    await fixture.whenStable();

    // Both canvases carry the vocabulary: a reservation on one alone would just reverse the slide.
    expect(
      el().querySelector('[data-testid="price-col"]')!.classList.contains('min-w-[92px]'),
    ).toBe(true);
  });

  it('the map skeleton is decorative and motion-reduce safe (#744)', () => {
    fixture.detectChanges();

    const loading = el().querySelector('[data-testid="map-loading"]')!;
    expect(loading.getAttribute('aria-hidden')).toBe('true');
    expect(loading.getAttribute('aria-live')).toBeNull();
    // A focusable node inside aria-hidden is an axe violation, so the skeleton canvas takes none.
    expect(loading.querySelector('[tabindex]')).toBeNull();
    // `inert` too: an overflowing scroller is focusable in Chromium with no tabindex at all.
    expect(loading.hasAttribute('inert')).toBe(true);

    const blocks = loading.querySelectorAll('[appSkeletonBlock], .animate-pulse');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.classList.contains('animate-pulse')).toBe(true);
      expect(block.classList.contains('motion-reduce:animate-none')).toBe(true);
    }

    flushVenue(); // settle the read for the suite's http.verify()
  });

  it('requests the venue from the route id', () => {
    flushVenue();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders 24 positioned tiles', async () => {
    flushVenue();
    await fixture.whenStable();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(24);
  });

  it('fills the canvas-owned row height with set tiles, never a height mechanism of its own (#685)', async () => {
    flushVenue();
    await fixture.whenStable();
    expectCellsFillCanvasRow(el(), '[data-testid="set-tile"]');
  });

  it('renders the photo band in the venue header, leaving the overview card as count + bar (#704)', async () => {
    flushVenue();
    await fixture.whenStable();

    const band = el().querySelector('.photo-band')!;
    expect(band.closest('header')).not.toBeNull();
    expect(band.className).toContain('h-[150px]');
    expect(band.className).toContain('min-[1024px]:h-[264px]');

    // The card the count lives on holds nothing else — the trust content moved out of the status card.
    const card = el().querySelector('[data-testid="availability"]')!.closest('[appCardGlass]')!;
    expect(card.querySelector('.photo-band')).toBeNull();
    expect(card.querySelector('app-photo-slideshow')).toBeNull();
  });

  it('mirrors the band in the loading skeleton so the frame does not jump (#704)', () => {
    fixture.detectChanges();

    const header = el().querySelector('[data-testid="map-skeleton-header"]')!;
    const stand = header.querySelector('[data-testid="map-skeleton-band"]')!;
    expect(stand.className).toContain('h-[150px]');
    expect(stand.className).toContain('min-[1024px]:h-[264px]');
    expect(el().querySelector('[data-testid="map-skeleton-overview"]')!.innerHTML).not.toContain(
      'h-[150px]',
    );

    flushVenue();
  });

  it('paints the no-photo empty state as an opaque warm sun (#704)', async () => {
    flushVenue(); // the fixture has no photos
    await fixture.whenStable();

    const sun = el().querySelector('[data-testid="map-banner-empty"]')!;
    const fill = /bg-\[radial-gradient\(([^\]]*)\)\]/.exec(sun.className)?.[1];
    // Every stop opaque: an alpha stop composites against the cyan band and reads pale green.
    expect(fill).toBeDefined();
    expect(fill).not.toContain('rgba');
    expect(sun.className).toContain('min-[1024px]:size-[96px]');
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
    // Letterboxed, not cropped — a portrait photo stays whole against the band's own gradient.
    expect(img?.classList.contains('object-contain')).toBe(true);
    expect(img?.classList.contains('object-cover')).toBe(false);
  });

  it('falls back to the bare gradient band without the pill when there is no cover photo (#142)', async () => {
    flushVenue(); // the fixture has no coverPhoto
    await fixture.whenStable();

    expect(el().querySelector('[data-testid="map-banner-img"]')).toBeNull();
    expect(el().querySelector('.photo-band')).toBeTruthy();
    expect(el().textContent).not.toContain('coming soon');
  });

  it('cycles the banner slideshow through its own controls when only one photo is set', async () => {
    venueRequest().flush({
      ...miramar(),
      photos: ['/api/venues/1/photos/bb02'],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const band = el().querySelector('.photo-band')!;
    const slides = band.querySelectorAll<HTMLImageElement>(
      '[data-testid="map-banner-img"], [data-testid="map-banner-slide-img"]',
    );
    expect(slides.length).toBe(1);
    // The service resolves each wire path against the API origin.
    expect(slides[0].getAttribute('src')).toBe(
      `${environment.apiBaseUrl}/api/venues/1/photos/bb02`,
    );

    // A single photo has nothing to step through — no controls, no dots.
    expect(band.querySelector('[data-testid="map-banner-next"]')).toBeNull();
    expect(band.querySelectorAll('[data-testid="map-banner-dots"] span').length).toBe(0);
  });

  it('renders the wide gallery grid instead of the header band once 2+ photos are set', async () => {
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

    // The header keeps its narrower shell — no in-header photo band once the grid takes over.
    expect(el().querySelector('.photo-band')).toBeNull();

    const hero = el().querySelector<HTMLImageElement>('[data-testid="gallery-hero"]')!;
    const tiles = el().querySelectorAll<HTMLImageElement>('[data-testid="gallery-tile"]');
    expect(hero.getAttribute('src')).toBe(`${environment.apiBaseUrl}/api/venues/1/photos/bb02`);
    expect(tiles.length).toBe(2);
    expect(tiles[0].getAttribute('src')).toBe(`${environment.apiBaseUrl}/api/venues/1/photos/cc03`);
    expect(tiles[1].getAttribute('src')).toBe(`${environment.apiBaseUrl}/api/venues/1/photos/dd04`);
  });

  it('opens the lightbox from the single-photo band and returns focus to it on dismiss (#765)', async () => {
    venueRequest().flush({ ...miramar(), photos: ['/api/venues/1/photos/bb02'] });
    await fixture.whenStable();
    fixture.detectChanges();

    const trigger = el().querySelector<HTMLButtonElement>('[data-testid="photo-band-view"]')!;
    trigger.click();
    fixture.detectChanges();
    expect(el().querySelector('app-photo-lightbox[role="dialog"]')).not.toBeNull();

    el()
      .querySelector<HTMLElement>('app-photo-lightbox')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    expect(el().querySelector('app-photo-lightbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not offer a photo lightbox trigger when the venue has no photos', async () => {
    flushVenue(); // the fixture has no photos
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="photo-band-view"]')).toBeNull();
  });

  it('opens the lightbox from a gallery tile, seeded at that photo, and returns focus on dismiss', async () => {
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

    const tile = el().querySelector<HTMLButtonElement>('[data-testid="gallery-photo-2"]')!;
    tile.click();
    fixture.detectChanges();

    const slides = el().querySelectorAll<HTMLImageElement>(
      '[data-testid="lightbox-img"], [data-testid="lightbox-slide-img"]',
    );
    expect(slides[2].classList.contains('opacity-0')).toBe(false);

    el().querySelector<HTMLButtonElement>('[data-testid="lightbox-close"]')!.click();
    fixture.detectChanges();
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    expect(el().querySelector('app-photo-lightbox')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it('closes the lightbox on an in-place venue switch, instead of reopening on the new venue', async () => {
    venueRequest().flush({ ...miramar(), photos: ['/api/venues/1/photos/bb02'] });
    await fixture.whenStable();
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('[data-testid="photo-band-view"]')!.click();
    fixture.detectChanges();
    expect(el().querySelector('app-photo-lightbox')).not.toBeNull();

    params$.next(convertToParamMap({ id: '2' }));
    await fixture.whenStable();
    fixture.detectChanges();

    // Torn down with the rest of venue 1's state, not carried over as stale index.
    expect(el().querySelector('app-photo-lightbox')).toBeNull();

    venueRequest(2).flush({
      ...miramar(),
      id: 2,
      name: 'Riviera Blue',
      photos: ['/api/venues/1/photos/aa01', '/api/venues/1/photos/cc03'],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    // The new venue's gallery grid renders closed — the stale index must not reopen it.
    expect(el().querySelector('[data-testid="gallery-photo-0"]')).not.toBeNull();
    expect(el().querySelector('app-photo-lightbox')).toBeNull();
  });

  it('marks the premium front row and the taken sets distinctly', async () => {
    flushVenue();
    await fixture.whenStable();
    // A taken front-row set is a ghost, not a premium tile: the 6 split 4 + 2 (#701).
    expect(el().querySelectorAll('.set-tile.premium').length).toBe(4);
    expect(el().querySelectorAll('.set-tile.taken').length).toBe(6); // 18 of 24 free
  });

  it('lets the appearance directive own every tile colour — the template adds none (#701)', async () => {
    flushVenue();
    await fixture.whenStable();
    // The unit host in `map-tile.spec.ts` cannot see this: it pins the directive against itself.
    const paints = /^(bg-|text-\[#|border-\[#|border-dashed)/;
    for (const tile of el().querySelectorAll('.set-tile')) {
      const state = tile.getAttribute('data-state')!;
      const own = [...tile.classList].filter((token) => paints.test(token));
      expect(own.sort(), `the ${state} tile paints itself`).toEqual(
        appearanceClassesFor(state).sort(),
      );
    }
  });

  it('spells one state two ways that can never select different tiles (#701)', async () => {
    flushVenue();
    await fixture.whenStable();
    for (const state of ['premium', 'walkin', 'taken']) {
      const byClass = [...el().querySelectorAll(`.set-tile.${state}`)];
      const byAttribute = [...el().querySelectorAll(`.set-tile[data-state="${state}"]`)];
      expect(byClass, `.${state} vs [data-state=${state}]`).toEqual(byAttribute);
    }
  });

  it('shows the availability summary "18 of 24"', async () => {
    flushVenue();
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="availability"]')?.textContent).toContain('18 of 24');
    expect(el().querySelector('[data-testid="availability-bar"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="map-empty"]')).toBeNull();
  });

  it('explains an empty map instead of framing empty space (#717)', async () => {
    flushMapless();
    await fixture.whenStable();

    const card = el().querySelector('[data-testid="beach-grid"]')!;
    const empty = card.querySelector<HTMLElement>('[data-testid="map-empty"]');
    expect(empty).not.toBeNull();
    expect(empty!.querySelector('h2')?.textContent).toContain('No sunbeds mapped yet');
    // Sets come from the layout, not the date — say so, or the tourist hunts for a better day.
    expect(empty!.textContent).toContain('on any date');

    const sea = card.querySelector('.sea-banner')!;
    const promenade = card.querySelector('.promenade')!;
    expect(sea.compareDocumentPosition(empty!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(promenade.compareDocumentPosition(empty!) & Node.DOCUMENT_POSITION_PRECEDING).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it('offers a way out of an empty map, back to Discover (#717)', async () => {
    flushMapless();
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const exit = el().querySelector<HTMLButtonElement>('[data-testid="map-empty-back"]')!;
    expect(exit.textContent).toContain('Back to Discover');
    exit.click();

    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('replaces the 0-of-0 summary and its empty bar with a plain no-sets line (#717)', async () => {
    flushMapless();
    await fixture.whenStable();

    const summary = el().querySelector('[data-testid="availability"]')!;
    expect(summary.textContent?.trim()).toBe('No sets to book yet');
    // Only the text branches: swapping the live region itself would announce unreliably.
    expect(summary.getAttribute('aria-live')).toBe('polite');
    expect(el().querySelector('[data-testid="availability-bar"]')).toBeNull();
  });

  it('the INSTANT footer names booking, device-neutrally', async () => {
    flushVenue();
    await fixture.whenStable();

    const footer = el().querySelector('[canvasFooter]')!;
    expect(footer.textContent).toContain('Pick any free set to book it');
    expect(footer.textContent).toContain('prices are per set, full day');
    expect(footer.textContent).not.toMatch(/tap|request/i);
  });

  it('the REQUEST footer explains the no-charge deal at the tap, naming the venue', async () => {
    flushRequestVenue();
    await fixture.whenStable();

    const footer = el().querySelector('[canvasFooter]')!;
    expect(footer.textContent).toContain(
      'Pick a set to request it \u2014 you pay only once Miramar Beach Club accepts.',
    );
    expect(footer.textContent).toContain('Prices are per set, full day.');
  });

  it('renders no legend, grid or tap-hint for a venue with no sets (#717)', async () => {
    flushMapless();
    await fixture.whenStable();

    expect(el().querySelector('ul[aria-label="Legend"]')).toBeNull();
    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(0);
    expect(el().querySelector('[data-testid="map-pan"]')).toBeNull();
    expect(el().textContent).not.toContain('Pick any free set to book it');
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

  it('splits the header chips into a semantic family and a descriptive one (#705)', async () => {
    venueRequest().flush({ ...miramar(), ratingTenths: 0, reviewsCount: 0 });
    await fixture.whenStable();

    const header = el().querySelector('header')!;
    // The same two platform claims as the Discover card, wearing the same pill — that parity is the point of #705.
    const semantic = [...header.querySelectorAll('.semantic-chip')].map((chip) =>
      chip.textContent?.trim(),
    );
    expect(semantic).toEqual(['Instant Book', 'New']);
    // The venue's own descriptions keep the pale pill.
    const descriptive = [...header.querySelectorAll('[data-testid="venue-chips"] .amenity-chip')];
    expect(descriptive.length).toBeGreaterThan(0);
    expect(descriptive.some((chip) => chip.classList.contains('semantic-chip'))).toBe(false);
  });

  it('renders the stored row labels on the rail, in insertion order (#724)', async () => {
    flushVenue();
    await fixture.whenStable();
    const codes = [...el().querySelectorAll('[data-testid="row-code"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(codes).toEqual(['Front row · Sea view', 'Row 2', 'Row 3', 'Row 4 · Back']);
  });

  it('caps the rail chips with an ellipsis — tile names carry the full label (#724)', async () => {
    flushVenue();
    await fixture.whenStable();
    const inner = el().querySelector('[data-testid="row-code"] .truncate')!;
    expect(inner.classList.contains('max-w-12')).toBe(true);
    expect(inner.classList.contains('sm:max-w-[96px]')).toBe(true);
    expect(inner.textContent?.trim()).toBe('Front row · Sea view');
    // Below the cap the rail still reserves what the skeleton drew, so a short-labelled venue does not slide either (#749).
    const column = inner.closest('[data-testid="row-code"]')!.parentElement!.parentElement!;
    expect(column.classList.contains('min-w-[54px]')).toBe(true);
  });

  it("renders the price once per zone, carrying the row's meaning (#672, #702)", async () => {
    flushVenue();
    await fixture.whenStable();
    const prices = [...el().querySelectorAll('[data-testid="row-price"]')].map((n) =>
      n.textContent?.trim(),
    );
    // Rows B and C share €35 — one zone, one chip: 4 rows render 3 chips, from minor units.
    // Each chip now says what the price buys: the named front row, the back row's channel.
    expect(prices).toEqual(['€45 · Front row', '€35', '€25 · at venue']);
  });

  it('splits an equally-priced walk-in row into its own zone (#702)', async () => {
    const base = miramar();
    // At row B/C's €35, price alone would fold row D into their zone and render no chip.
    const sets = base.sets.map((s) =>
      s.pool === 'WALK_IN' ? { ...s, price: { minorUnits: 3500, currency: 'EUR' } } : s,
    );
    venueRequest().flush({ ...base, sets });
    await fixture.whenStable();

    const prices = [...el().querySelectorAll('[data-testid="row-price"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(prices).toEqual(['€45 · Front row', '€35', '€35 · at venue']);
    // …and the split is spatial too: D opens a zone, so the gap lands on all three columns.
    const zoneGaps = [false, true, false, true];
    expect(
      [...el().querySelectorAll('[data-map-row]')].map((r) => r.classList.contains('mt-3')),
    ).toEqual(zoneGaps);
    const priceCells = [...el().querySelector('[data-testid="price-col"]')!.children];
    expect(priceCells.map((c) => c.classList.contains('mt-3'))).toEqual(zoneGaps);
  });

  it('announces the stored row label — a walkway cannot shift identities (#724)', async () => {
    const base = miramar();
    // A gap row in the editor's grid saves no sets, so the venue's own labels skip a letter.
    const original = [...new Set(base.sets.map((s) => s.rowLabel))];
    const shifted = ['A', 'C', 'D', 'E'];
    const sets = base.sets.map((s) => ({
      ...s,
      rowLabel: shifted[original.indexOf(s.rowLabel)],
    }));
    venueRequest().flush({ ...base, sets });
    await fixture.whenStable();

    // The rail reads the venue's own letters — including the skip.
    const codes = [...el().querySelectorAll('[data-testid="row-code"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(codes).toEqual(['A', 'C', 'D', 'E']);
    // A bare label still adds nothing beside a rail that now reads it verbatim.
    const prices = [...el().querySelectorAll('[data-testid="row-price"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(prices).toEqual(['€45 · Front row', '€35', '€25 · at venue']);
    // Tiles announce only the stored label — "Set B1, C, …" can no longer be spoken.
    const names = [...el().querySelectorAll('[data-testid="set-tile"]')].map(
      (t) =>
        t.getAttribute('aria-label') ?? t.querySelector('button')?.getAttribute('aria-label') ?? '',
    );
    expect(names[0]).toBe('A · spot 1, front row, €45, taken');
    expect(names.some((n) => n.startsWith('C · spot '))).toBe(true);
    expect(names.some((n) => /^Set [A-Z]+\d/.test(n))).toBe(false);
  });

  it('keeps two identically-priced premium rows in one zone (#702)', async () => {
    const base = miramar();
    // Rows A and B are both premium at €45: one price, one tier, so one zone and one chip.
    const rows = [...new Set(base.sets.map((s) => s.rowLabel))];
    const sets = base.sets.map((s) =>
      s.rowLabel === rows[1]
        ? { ...s, tier: 'PREMIUM' as const, price: { minorUnits: 4500, currency: 'EUR' } }
        : s,
    );
    venueRequest().flush({ ...base, sets });
    await fixture.whenStable();

    const prices = [...el().querySelectorAll('[data-testid="row-price"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(prices).toEqual(['€45 · Front row', '€35', '€25 · at venue']);
    expect(
      [...el().querySelectorAll('[data-map-row]')].map((r) => r.classList.contains('mt-3')),
    ).toEqual([false, false, true, true]);
  });

  it('keeps the rail decorative — tile names carry the one stored identity (#702, #724)', async () => {
    flushVenue();
    await fixture.whenStable();
    const chip = el().querySelector('[data-testid="row-price"]')!;
    expect(chip.closest('[aria-hidden="true"]')).not.toBeNull();
    // The booking surfaces' own phrase: what the map announces, the mail later prints.
    const firstTile = el().querySelector('[data-testid="set-tile"]');
    expect(firstTile?.getAttribute('aria-label')).toBe(
      'Front row · Sea view · spot 1, front row, €45, taken',
    );
    const names = [...el().querySelectorAll('[data-testid="set-tile"]')].map(
      (t) =>
        t.getAttribute('aria-label') ?? t.querySelector('button')?.getAttribute('aria-label') ?? '',
    );
    expect(names.some((name) => name.includes('at venue'))).toBe(false);
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

  it('renders a mixed-price row as its min–max span, in a zone of its own (#689)', async () => {
    const base = miramar();
    const sets = base.sets.map((s) =>
      s.rowLabel === 'Row 2' && s.positionNo === 2
        ? { ...s, price: { minorUnits: 4500, currency: 'EUR' } }
        : s,
    );
    venueRequest().flush({ ...base, sets });
    await fixture.whenStable();
    const prices = [...el().querySelectorAll('[data-testid="row-price"]')].map((n) =>
      n.textContent?.trim(),
    );
    // Row 2 mixes €35 + €45: its chip is the span, so it no longer shares Row 3's €35 zone.
    expect(prices).toEqual(['€45 · Front row', '€35–€45', '€35', '€25 · at venue']);
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

  it('gives each tile an accessible name carrying its row, spot and state (not colour-only)', async () => {
    flushVenue();
    await fixture.whenStable();
    const firstTile = el().querySelector('[data-testid="set-tile"]'); // spot 1 — taken, so the <li> carries the name
    expect(firstTile?.getAttribute('aria-label')).toContain('Front row · Sea view · spot 1');
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
      t.getAttribute('aria-label')?.startsWith('Row 4 · Back · spot 4,'),
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

  it('renders the legend inside the map card, above the tile grid (#701)', async () => {
    flushVenue();
    await fixture.whenStable();
    const legends = el().querySelectorAll('ul[aria-label="Legend"]');
    expect(legends.length).toBe(1);

    const legend = legends[0];
    const card = el().querySelector('[data-testid="beach-grid"]')!;
    expect(card.contains(legend)).toBe(true);

    const firstTile = el().querySelector('[data-testid="set-tile"]')!;
    // Node.DOCUMENT_POSITION_FOLLOWING: the tile comes after the legend, so colours decode first.
    expect(legend.compareDocumentPosition(firstTile) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('gives every legend swatch the state of the tile it stands for (#701)', async () => {
    flushVenue();
    await fixture.whenStable();
    const swatches = [...el().querySelectorAll('ul[aria-label="Legend"] [data-state]')];
    expect(swatches.map((s) => s.getAttribute('data-state'))).toEqual([
      'available',
      'premium',
      'walkin',
      'taken',
    ]);
  });

  it('renders a free walk-in tile hatched and a taken one as the ghost (#701)', async () => {
    flushVenue();
    await fixture.whenStable();
    // A bookable tile carries its name on the inner button, a static one on the `<li>` itself.
    const stateOf = (rowLabel: string, positionNo: number): string | null => {
      const named = `[aria-label^="${rowLabel} · spot ${positionNo},"]`;
      const tile = [...el().querySelectorAll('.set-tile')].find(
        (t) => t.matches(named) || t.querySelector(named) !== null,
      );
      return tile!.getAttribute('data-state');
    };
    expect(stateOf('Row 4 · Back', 1)).toBe('walkin');
    expect(stateOf('Row 4 · Back', 4)).toBe('taken');
    expect(stateOf('Front row · Sea view', 2)).toBe('premium');
  });

  it('keeps the bookable button accessible name ending in "Select to book"', async () => {
    flushVenue();
    await fixture.whenStable();
    const label = el().querySelector('.set-button')?.getAttribute('aria-label');
    expect(label).toContain('Select to book'); // pinned so booking-flow.e2e.ts keeps matching
  });

  it('mounts the shared cutoff note above the date floor it explains', async () => {
    flushVenue();
    await fixture.whenStable();
    // The test id exists only in shared/cutoff-note.ts, so finding it proves the note mounted.
    const note = el().querySelector('[data-testid="cutoff-note"]')!;
    expect(note.tagName).toBe('P');
    // A clause, not the sentence — the wording stays pinned once, in cutoff-note.spec.ts.
    expect(note.textContent).toContain('sales close at');
    expect(note.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    // Class pin (jsdom computes no Tailwind): the map keeps the bare header-glass ink.
    expect(note.classList.contains('text-(--riv-ink-faint)')).toBe(true);
    // The floor the note explains, as the picker now expresses it: tomorrow is offered, today is not.
    await openPicker();
    const floor = defaultBookingDate(new Date());
    expect(calendarDay(floor).getAttribute('aria-disabled')).toBeNull();
    expect(calendarDay(todayBookingDate(new Date())).getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the date field a light surface under the dark riviera document (#675)', async () => {
    flushVenue();
    await fixture.whenStable();
    fixture.detectChanges();
    // #675's opt-out had a native widget to opt out; #761 leaves the light field itself.
    expect(dateTrigger().classList.contains('bg-[rgba(255,255,255,0.9)]')).toBe(true);
    expect(dateTrigger().classList.contains('text-(--riv-card-ink)')).toBe(true);
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

  /** #693: a 404 (venue gone or hidden) is a distinct dead end — no retry, a way back instead. */
  it('shows the not-available state on a 404, with back-to-Discover instead of retry', async () => {
    venueRequest().flush('gone', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    const panel = el().querySelector('[data-testid="map-not-found"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('alert');
    expect(panel?.querySelector('.failure-title')?.textContent).toContain('isn’t available');
    expect(el().querySelector('[data-testid="map-error"]')).toBeNull();
    expect(el().querySelector('[data-testid="map-retry"]')).toBeNull();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el().querySelector<HTMLButtonElement>('[data-testid="map-back-home"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('says nothing over the not-available panel — a 404 is not a loaded map (#741 review)', async () => {
    venueRequest().flush('gone', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(el().querySelector('[data-testid="load-announcer"]')!.textContent?.trim()).toBe('');
  });

  /** #693 review F-1: a hidden-while-browsing venue must not keep serving the stale map. */
  it('replaces a loaded map with the not-available panel when a date change 404s', async () => {
    flushVenue();
    await fixture.whenStable();

    const c = fixture.componentInstance as unknown as { onDateChange(value: string): void };
    const dateB = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    c.onDateChange(dateB);
    venueRequest().flush('gone', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(0);
    const panel = el().querySelector('[data-testid="map-not-found"]');
    expect(panel).not.toBeNull();
    // The teardown destroyed the subtree focus may sit in — the move is deliberate (RV-FE-9).
    expect(document.activeElement).toBe(panel);
  });

  describe('the availability calendar', () => {
    it('replaces the native date input with a labelled calendar trigger', async () => {
      flushVenue();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el().querySelector('input[type="date"]')).toBeNull();
      expect(dateTrigger().tagName).toBe('BUTTON');
      expect(dateTrigger().getAttribute('aria-haspopup')).toBe('dialog');
      expect(dateTrigger().getAttribute('aria-expanded')).toBe('false');
      expect(el().querySelector('[data-testid="availability-calendar"]')).toBeNull();
    });

    it('opens the calendar for the venue and the day the map is showing', async () => {
      flushVenue();
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.detectChanges();
      dateTrigger().click();
      fixture.detectChanges();
      await fixture.whenStable();

      const request = httpMock.expectOne((req) =>
        req.url.endsWith('/api/venues/1/availability-calendar'),
      );
      expect(request.request.params.get('from')).toBe(
        `${defaultBookingDate(new Date()).slice(0, 7)}-01`,
      );
      expect(dateTrigger().getAttribute('aria-expanded')).toBe('true');
      flushCalendar(request);
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="availability-calendar"]')).not.toBeNull();
    });

    it("drives the map re-fetch and the dialog's seeded date from the chosen day", async () => {
      flushVenue();
      await fixture.whenStable();
      fixture.detectChanges();
      await openPicker();
      const chosen = defaultBookingDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));

      pickDay(chosen);

      const request = venueRequest();
      expect(request.request.params.get('date')).toBe(chosen);
      request.flush(miramar());
      await fixture.whenStable();
      fixture.detectChanges();

      // Closed, and the map and the dialog now agree on the one date the component holds.
      expect(el().querySelector('[data-testid="availability-calendar"]')).toBeNull();
      expect(dateTrigger().getAttribute('data-date')).toBe(chosen);
      el().querySelector<HTMLButtonElement>('[data-testid="set-tile"] button')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      // The RENDERED date: `date` is a signal input, so a reflected-attribute read is a tautology.
      expect(
        el().querySelector('app-booking-dialog [data-testid="dialog-date"]')!.textContent,
      ).toContain(formatBookingDate(chosen));
    });

    it('returns focus to the trigger when the calendar is dismissed', async () => {
      flushVenue();
      await fixture.whenStable();
      fixture.detectChanges();
      await openPicker();

      el()
        .querySelector<HTMLElement>('app-availability-calendar')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

      expect(el().querySelector('[data-testid="availability-calendar"]')).toBeNull();
      expect(document.activeElement).toBe(dateTrigger());
    });

    it('closes the calendar without chasing a trigger the failure destroyed (RV-FE-9)', async () => {
      flushVenue();
      await fixture.whenStable();
      fixture.detectChanges();
      await openPicker();
      const chosen = defaultBookingDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));

      pickDay(chosen);
      venueRequest().flush('gone', { status: 404, statusText: 'Not Found' });
      await fixture.whenStable();
      fixture.detectChanges();

      const panel = el().querySelector('[data-testid="map-not-found"]');
      expect(el().querySelector('[data-testid="availability-calendar"]')).toBeNull();
      expect(el().querySelector('[data-testid="map-date"]')).toBeNull();
      expect(document.activeElement).toBe(panel);
    });
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
    await openPicker();
    pickDay(chosen);
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

    const c = fixture.componentInstance as unknown as { onDateChange(value: string): void };
    const dateB = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    c.onDateChange(dateB);
    const detour = venueRequest();
    c.onDateChange(defaultBookingDate(new Date()));
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
      await openPicker();
      expect(calendarDay(defaultBookingDate(new Date())).getAttribute('aria-disabled')).toBeNull();
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
    expect(dateTrigger().getAttribute('data-date')).toBe(carried);
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
    await openPicker();
    pickDay(chosen);
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

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="map-date"]',
    )!;
    // The picker's trigger shows the carried date, not the default.
    expect(trigger.getAttribute('data-date')).toBe(chosen);
    expect(trigger.textContent).toContain(formatCivilDate(chosen));
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
