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

import { environment } from '../../../environments/environment';
import { photoView, photoViews } from '../../../testing/photo-views';
import { defaultBookingDate } from '../../shared/booking-date';
import { FakeMapEngine, FakeMapHandle } from '../../shared/fake-map-engine';
import { PosterHandle } from '../../shared/poster-handle';
import { FakeGeolocationGateway } from '../../../testing/fake-geolocation';
import { GeolocationGateway } from '../../shared/geolocation';
import { MapEngine, MapEngineOptions } from '../../shared/map-engine';
import { RivieraMap } from '../../shared/riviera-map';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map-options';
import { VenueSummary } from '../../shared/venue-views';
import { DiscoverSheet } from './discover-sheet';
import { Home } from './home';
import { posterFor } from './map-poster';
import { VenuePinLayer } from './venue-pin-layer';

/**
 * The query that reaches the pre-Q Discover page — the hero, the three selects, the List/Map
 * switch, the preview card over the map. `/` is the riviera map now, so every describe below
 * that covers the old page has to ask for it; a describe that omits it is asserting the page
 * that ships. Both the parameter and the page it reaches are a one-release fallback.
 */
const PRE_Q = { map: 'off' } as const;

/** What `ActivatedRoute` is stubbed as: a live query map, plus the snapshot the page seeds from. */
interface RouteDouble {
  queryParamMap: BehaviorSubject<ParamMap>;
  snapshot: { queryParamMap: ParamMap };
}

/** A route double over `query`, for the blocks that never push a second navigation. */
function routeOf(query: Record<string, string>): RouteDouble {
  const params = new BehaviorSubject<ParamMap>(convertToParamMap(query));
  return { queryParamMap: params, snapshot: { queryParamMap: params.value } };
}

/** Two venues across two beaches/regions, mirroring the discovery summary shape. */
function venues(): VenueSummary[] {
  return [
    {
      id: 1,
      name: 'Miramar Beach Club',
      beach: 'KSAMIL',
      region: 'SARANDE',
      ratingTenths: 48,
      reviewsCount: 326,
      bookingMode: 'INSTANT',
      fromPrice: { minorUnits: 2500, currency: 'EUR' },
      // Four amenities out of catalogue order → the card shows the first 3 in catalogue
      // order (Beach bar, Free parking, Showers); WiFi is dropped. Plus a to-water distance.
      amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'],
      distanceToWaterM: 15,
      availability: { free: 18, total: 24 },
    },
    {
      id: 2,
      name: 'Aurora Bay',
      beach: 'DHERMI',
      region: 'HIMARE',
      ratingTenths: 41,
      reviewsCount: 88,
      bookingMode: 'REQUEST',
      fromPrice: { minorUnits: 3000, currency: 'EUR' },
      availability: { free: 5, total: 10 },
    },
  ];
}

/**
 * The route-carried day. A venue-caused cancellation mails a link here when the venue itself cannot
 * sell the date, so `/?date=…` has to count that day rather than today — and a past or malformed
 * value must clamp, since the picker's `min` cannot police a hand-typed URL.
 */
describe('Home (the route-carried date)', () => {
  let params: BehaviorSubject<ParamMap>;
  let httpMock: HttpTestingController;

  function renderWith(date: string | null): ComponentFixture<Home> {
    TestBed.resetTestingModule();
    params = new BehaviorSubject<ParamMap>(convertToParamMap(date === null ? {} : { date }));
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
        },
        // jsdom measures no viewport, so no poster fits and the ground is live from the start.
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    return fixture;
  }

  function dateOfNextRequest(): string | null {
    const req = httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`);
    const date = req.request.params.get('date');
    req.flush(venues());
    return date;
  }

  afterEach(() => httpMock.verify());

  it('seeds the selected date from the route’s ?date', () => {
    const fixture = renderWith('2027-07-04');

    expect(dateOfNextRequest()).toBe('2027-07-04');
    fixture.detectChanges();
    // The head's day chip carries no year; parts, not the string, since ICU punctuation varies.
    const day = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="head-day"]');
    expect(day?.textContent).toContain('Sun');
    expect(day?.textContent).toContain('4 Jul');
    expect(day?.textContent).not.toContain('2027');
  });

  it.each([['2001-01-01'], ['not-a-date'], [null]])(
    'clamps %s to the earliest bookable day',
    (date) => {
      renderWith(date);

      expect(dateOfNextRequest()).toBe(defaultBookingDate(new Date()));
    },
  );

  it('re-counts when a later navigation changes only ?date', () => {
    renderWith('2027-07-04');
    expect(dateOfNextRequest()).toBe('2027-07-04');

    params.next(convertToParamMap({ date: '2027-07-09' }));

    expect(dateOfNextRequest()).toBe('2027-07-09');
  });
});

describe('Home (venue discovery)', () => {
  let fixture: ComponentFixture<Home>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeOf(PRE_Q) },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Match the list request on path only (query params vary by filter/date). */
  function listRequest(): TestRequest {
    return httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues`);
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('requests the venue list for today in Europe/Tirane by default', () => {
    const req = listRequest();
    expect(req.request.params.get('date')).toBe(defaultBookingDate(new Date()));
    // No filter params on the initial load.
    expect(req.request.params.has('beach')).toBe(false);
    expect(req.request.params.has('region')).toBe(false);
    req.flush(venues());
  });

  it('renders the cover photo on a card that has one and the gradient fallback on one that does not (#142)', async () => {
    const [withCover, noPhoto] = venues();
    listRequest().flush([
      {
        ...withCover,
        coverPhoto: {
          card: photoView('/api/venues/1/photos/aa01'),
          banner: photoView('/api/venues/1/photos/bb02'),
        },
      },
      noPhoto,
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = el().querySelectorAll('[data-testid="venue-card"]');
    const coverImg = cards[0].querySelector<HTMLImageElement>('[data-testid="card-photo-img"]');
    // The service resolves the wire's root-relative path against the API origin.
    expect(coverImg?.getAttribute('src')).toBe(
      `${environment.apiBaseUrl}/api/venues/1/photos/aa01`,
    );
    // The scrim stays layered over the photo, as paint only: the location text's AA floor needs the layering, the card link needs the pointer.
    const scrim = cards[0].querySelector('.photo-scrim');
    expect(scrim).toBeTruthy();
    expect(scrim?.classList.contains('pointer-events-none')).toBe(true);
    expect(cards[0].querySelector('.photo-sun')).toBeNull();
    // No cover → the gradient placeholder (sun, no img).
    expect(cards[1].querySelector('[data-testid="card-photo-img"]')).toBeNull();
    expect(cards[1].querySelector('.photo-sun')).toBeTruthy();
    // A single photo is no slideshow: no step controls, no dots.
    expect(cards[0].closest('li')?.querySelector('[data-testid="card-photo-next"]')).toBeNull();
    expect(cards[0].querySelector('[data-testid="card-photo-dots"]')).toBeNull();
  });

  it('badges a venue whose online sales for today have closed', async () => {
    const [closed, open] = venues();
    listRequest().flush([
      { ...closed, salesOpen: false },
      { ...open, salesOpen: true },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = el().querySelectorAll('[data-testid="venue-card"]');
    const chip = cards[0].querySelector('.sales-closed-chip');
    expect(chip?.textContent).toContain('Sales closed for today');
    // The card body is aria-hidden, so the closed state must ride the card's accessible name.
    expect(cards[0].getAttribute('aria-label')).toContain('online sales for today have closed');
    expect(cards[1].querySelector('.sales-closed-chip')).toBeNull();
    expect(cards[1].getAttribute('aria-label')).not.toContain('closed');
  });

  it('badges a venue closed for the season with its reopen day, ahead of the sales-closed chip, and keeps the served order', async () => {
    const [first, second] = venues();
    listRequest().flush([
      { ...first, salesOpen: true },
      { ...second, salesOpen: false, closedForSeason: true, reopensOn: '2027-05-15' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = el().querySelectorAll('[data-testid="venue-card"]');
    // The server sorts closed venues last; the client never re-orders.
    expect(cards[1].textContent).toContain('Aurora Bay');
    const chip = cards[1].querySelector('.closed-for-season-chip');
    expect(chip?.textContent?.replace(/\s+/g, ' ')).toContain('Closed for season · reopens 15 May');
    // One claim at a time: the season chip replaces the sales-closed one.
    expect(cards[1].querySelector('.sales-closed-chip')).toBeNull();
    expect(cards[1].getAttribute('aria-label')).toContain('closed for season, reopens 15 May');
    expect(cards[1].getAttribute('aria-label')).not.toContain('online sales for today');
    expect(cards[0].querySelector('.closed-for-season-chip')).toBeNull();
  });

  it('badges a closure with no reopen day without naming one', async () => {
    const [first] = venues();
    listRequest().flush([{ ...first, salesOpen: false, closedForSeason: true, reopensOn: null }]);
    await fixture.whenStable();
    fixture.detectChanges();

    const card = el().querySelector('[data-testid="venue-card"]')!;
    expect(card.querySelector('.closed-for-season-chip')?.textContent?.trim()).toBe(
      'Closed for season',
    );
    expect(card.getAttribute('aria-label')).toContain('closed for season.');
  });

  it('shows no closed badge when the payload omits salesOpen (older test double)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('.sales-closed-chip')).toBeNull();
  });

  it("passes the Discover grid's own sizes to the slideshow, not the 100vw default", async () => {
    const [venue] = venues();
    listRequest().flush([{ ...venue, photos: photoViews(['/api/venues/1/photos/aa01']) }]);
    await fixture.whenStable();
    fixture.detectChanges();

    const img = el()
      .querySelector('[data-testid="venue-card"]')!
      .closest('li')!
      .querySelector('img')!;
    // vw only (a pixel value throws, RuntimeError 2952), tracking the auto-fill grid's columns.
    expect(img.getAttribute('sizes')).toBe(
      'auto, (min-width: 1128px) 30vw, (min-width: 768px) 47vw, 92vw',
    );
  });

  it('renders the photo slideshow — resolved slide stack, dots, and step controls outside the card link', async () => {
    const [venue] = venues();
    listRequest().flush([
      {
        ...venue,
        photos: photoViews([
          '/api/venues/1/photos/aa01',
          '/api/venues/1/photos/cc03',
          '/api/venues/1/photos/dd04',
        ]),
      },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const item = el().querySelector('[data-testid="venue-card"]')!.closest('li')!;
    const shownSrc = (): string | undefined =>
      [...item.querySelectorAll('img')]
        .find((img) => !img.classList.contains('opacity-0'))
        ?.getAttribute('src') ?? undefined;
    const resolved = (hash: string): string =>
      `${environment.apiBaseUrl}/api/venues/1/photos/${hash}`;

    // Only the slide on show is mounted; the service resolves each wire path against the API origin.
    expect(item.querySelectorAll('img').length).toBe(1);
    expect(shownSrc()).toBe(resolved('aa01'));
    expect(item.querySelectorAll('[data-testid="card-photo-dots"] span').length).toBe(3);

    // The controls are the link's SIBLINGS (a nested interactive control is invalid + an axe fail).
    const next = item.querySelector<HTMLButtonElement>('[data-testid="card-photo-next"]')!;
    const prev = item.querySelector<HTMLButtonElement>('[data-testid="card-photo-prev"]')!;
    expect(next.closest('a')).toBeNull();
    expect(prev.closest('a')).toBeNull();

    next.click();
    fixture.detectChanges();
    expect(shownSrc()).toBe(resolved('cc03'));

    // Stepping back from the first photo wraps to the last.
    prev.click();
    prev.click();
    fixture.detectChanges();
    expect(shownSrc()).toBe(resolved('dd04'));

    // The position the card's own live region announces, since the band itself is aria-hidden.
    expect(item.querySelector('[data-testid="card-photo-position"]')!.textContent?.trim()).toBe(
      'Photo 3 of 3',
    );
  });

  it('renders a card per venue with name, location, rating, from-price and availability', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const cards = el().querySelectorAll('[data-testid="venue-card"]');
    expect(cards.length).toBe(2);

    const first = cards[0];
    expect(first.textContent).toContain('Miramar Beach Club');
    expect(first.textContent).toContain('Ksamil · Sarandë');
    expect(first.textContent).toContain('4.8'); // rating tenths → display
    expect(first.textContent).toContain('€25'); // fromPrice 2500 minor units
    expect(first.querySelector('[data-testid="card-availability"]')?.textContent).toContain(
      '18 of 24',
    );
  });

  it('renders a "New" state (no ★ 0.0 / "0 reviews") for an unrated venue (#154)', async () => {
    const [rated] = venues();
    const unrated: VenueSummary = {
      ...rated,
      id: 2,
      name: 'Miramare',
      ratingTenths: 0,
      reviewsCount: 0,
    };
    listRequest().flush([unrated]);
    await fixture.whenStable();

    const card = el().querySelector('[data-testid="venue-card"]')!;
    expect(card.querySelector('[data-testid="new-chip"]')?.textContent).toContain('New');
    expect(card.querySelector('.card-meta .star')).toBeNull();
    expect(card.querySelector('.card-meta .rating')).toBeNull();
    expect(card.querySelector('.card-meta')?.textContent).not.toContain('0.0');
    expect(card.querySelector('.card-meta')?.textContent).not.toContain('0 reviews');
  });

  it('does not announce "rated 0.0 out of 5" for an unrated venue (#154)', async () => {
    const [rated] = venues();
    const unrated: VenueSummary = {
      ...rated,
      id: 2,
      name: 'Miramare',
      ratingTenths: 0,
      reviewsCount: 0,
    };
    listRequest().flush([unrated]);
    await fixture.whenStable();

    const label =
      el().querySelector('[data-testid="venue-card"]')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('no reviews yet');
    expect(label).not.toContain('rated 0.0 out of 5');
  });

  it('links each card to the venue beach map, carrying the selected date (#294)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    const link = el().querySelector('[data-testid="venue-card"]');
    // The chosen date rides along as ?date= so it persists into the map (default = today, Tirane).
    expect(link?.getAttribute('href')).toBe(`/venues/1?date=${defaultBookingDate(new Date())}`);
  });

  it('updates the venue link’s date when the discovery date changes (#294)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    // A date guaranteed to differ from the default (today) on any calendar day (the 2026-07-14 flake).
    const future = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const input = el().querySelector<HTMLInputElement>('[data-testid="filter-date"]')!;
    input.value = future;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    listRequest().flush(venues()); // settle the date-change reload
    await fixture.whenStable();

    const href = el().querySelector('[data-testid="venue-card"]')?.getAttribute('href');
    expect(href).toBe(`/venues/1?date=${future}`);
  });

  it('gives each card a single accessible name carrying every fact (not layout-only)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    const label = el().querySelector('[data-testid="venue-card"]')?.getAttribute('aria-label');
    expect(label).toContain('Miramar Beach Club');
    expect(label).toContain('rated 4.8 out of 5');
    expect(label).toContain('18 of 24 sets free');
    expect(label).toContain('View beach map');
  });

  it('populates the beach and region filters from the catalogue', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    const beachOptions = [...el().querySelectorAll('[data-testid="filter-beach"] option')].map(
      (o) => o.textContent?.trim(),
    );
    expect(beachOptions).toEqual(['All beaches', 'Dhërmi', 'Ksamil']); // catalogue order (north to south), with the "all" default
  });

  it('re-queries with the chosen beach filter (sending the beach param)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const select = el().querySelector<HTMLSelectElement>('[data-testid="filter-beach"]')!;
    select.value = 'DHERMI';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const req = listRequest();
    expect(req.request.params.get('beach')).toBe('DHERMI');
    req.flush([venues()[1]]);
    await fixture.whenStable();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(1);
  });

  it('re-queries when the date changes', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    // A date guaranteed to differ from the default (today) on any calendar day (the 2026-07-14 flake).
    const chosen = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const input = el().querySelector<HTMLInputElement>('[data-testid="filter-date"]')!;
    input.value = chosen;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const req = listRequest();
    expect(req.request.params.get('date')).toBe(chosen);
    req.flush(venues());
  });

  it('floors the date picker at today in Europe/Tirane (no past date via the native picker) (#155)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const input = el().querySelector<HTMLInputElement>('[data-testid="filter-date"]')!;
    expect(input.min).toBe(defaultBookingDate(new Date()));
    expect(input.min).toBe(input.value); // the default selection sits on that floor
  });

  it('clamps a hand-typed past date up to the earliest bookable date, re-querying for it (#155)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const input = el().querySelector<HTMLInputElement>('[data-testid="filter-date"]')!;
    const min = defaultBookingDate(new Date());

    // Move off the floor to a valid future date, so the later clamp is observable as a change back.
    const future = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    input.value = future;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    listRequest().flush(venues());

    // Typing a past date (bypasses the native `min`) clamps to the floor and re-queries for it.
    input.value = '2020-01-01';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const req = listRequest();
    expect(req.request.params.get('date')).toBe(min);
    req.flush(venues());
    expect(input.value).toBe(min); // the rejected past date is reflected back to the floor
  });

  it('rejects a hand-typed past date when already on the floor — no extra query, field restored (#155)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const input = el().querySelector<HTMLInputElement>('[data-testid="filter-date"]')!;
    const min = defaultBookingDate(new Date());
    expect(input.value).toBe(min); // the default selection is the earliest bookable date

    input.value = '2020-01-01';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    // Clamped value equals the current selection → no re-query, and the field snaps back to the floor.
    httpMock.expectNone((req) => req.url === `${environment.apiBaseUrl}/api/venues`);
    expect(input.value).toBe(min);
  });

  it('renders the hero per the Liquid Glass design (chip + display headline)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    expect(el().querySelector('.hero-chip')?.textContent).toContain('Sunbeds by the sea');
    expect(el().querySelector('h1')?.textContent).toContain('Find your spot on the Riviera.');
  });

  it('shows the live result count with noun and date inside the filter bar', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const results = el().querySelector('[data-testid="results"]')!;
    expect(results.closest('form')).not.toBeNull(); // inside the filter bar
    expect(results.getAttribute('aria-live')).toBe('polite');
    // Assert the count element exactly — a substring match on the whole block is
    // vacuously satisfied by the digits of the year in the date label (review finding).
    expect(results.querySelector('.count-number')?.textContent?.trim()).toBe('2');
    expect(results.textContent).toContain('venues');
    expect(results.textContent).toMatch(/\b\d{4}\b/); // the formatted date, year kept
  });

  it('keeps the count visible in the empty state (0 venues)', async () => {
    listRequest().flush([]);
    await fixture.whenStable();

    const results = el().querySelector('[data-testid="results"]')!;
    expect(results.querySelector('.count-number')?.textContent?.trim()).toBe('0');
    expect(results.textContent).toContain('venues');
  });

  it('sizes the availability-bar fill as round(free/total*100)%', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const fills = el().querySelectorAll<HTMLElement>('.avail-fill');
    expect(fills.length).toBe(2);
    expect(fills[0].style.width).toBe('75%'); // 18 of 24
    expect(fills[1].style.width).toBe('50%'); // 5 of 10
  });

  it('renders a 0% availability bar for a venue with no sets (no division by zero)', async () => {
    const zeroSets: VenueSummary = {
      ...venues()[0],
      id: 3,
      name: 'Empty Cove',
      fromPrice: null,
      availability: { free: 0, total: 0 },
    };
    listRequest().flush([zeroSets]);
    await fixture.whenStable();

    expect(el().querySelector<HTMLElement>('.avail-fill')?.style.width).toBe('0%');
  });

  it('renders ≤3 amenity chips (catalogue order) + a to-water chip, and folds them into the label', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const cards = el().querySelectorAll('[data-testid="venue-card"]');

    // Venue 1: to-water chip first, then the first 3 amenities in catalogue order (WiFi dropped).
    const firstChips = cards[0].querySelector('[data-testid="card-chips"]')!;
    const chipTexts = [...firstChips.querySelectorAll('.amenity-chip')].map((c) =>
      c.textContent?.trim(),
    );
    expect(chipTexts).toEqual(['15m to water', 'Beach bar', 'Free parking', 'Showers']);

    // The card content is aria-hidden, so the chip text must also reach AT via the accessible name.
    const label = cards[0].getAttribute('aria-label') ?? '';
    expect(label).toContain('15m to water');
    expect(label).toContain('Amenities: Beach bar, Free parking, Showers');

    // Venue 2 states no amenities/distance → its slot renders nothing (collapses).
    const secondChips = cards[1].querySelector('[data-testid="card-chips"]');
    expect(secondChips?.textContent?.trim()).toBe('');
  });

  it('splits the card chips into a semantic family and a descriptive one (#705)', async () => {
    const [rated] = venues();
    listRequest().flush([{ ...rated, ratingTenths: 0, reviewsCount: 0 }]);
    await fixture.whenStable();

    const card = el().querySelector('[data-testid="venue-card"]')!;
    // The two chips that make a platform claim: how booking works, and that nobody has rated this venue yet.
    expect(card.querySelector('.mode-chip')?.classList.contains('semantic-chip')).toBe(true);
    expect(
      card.querySelector('[data-testid="new-chip"]')?.classList.contains('semantic-chip'),
    ).toBe(true);
    // Everything the venue says about itself stays in the descriptive family.
    const descriptive = [...card.querySelectorAll('[data-testid="card-chips"] .amenity-chip')];
    expect(descriptive.length).toBeGreaterThan(0);
    expect(descriptive.some((chip) => chip.classList.contains('semantic-chip'))).toBe(false);
  });

  it('shows a distinct empty state when no venues match', async () => {
    listRequest().flush([]);
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="empty"]')).not.toBeNull();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(0);
  });

  it('leaves the empty panel silent, since the count region speaks the outcome (#1078)', async () => {
    listRequest().flush([]);
    await fixture.whenStable();

    // Born holding its text it never announced, and the count region already speaks this outcome.
    const empty = el().querySelector('[data-testid="empty"]')!;
    expect(empty.getAttribute('aria-live')).toBeNull();
    expect(empty.getAttribute('role')).toBeNull();
    expect(empty.tagName).toBe('P');

    const results = el().querySelector('[data-testid="results"]')!;
    expect(results.getAttribute('aria-live')).toBe('polite');
    expect(results.querySelector('.count-number')?.textContent?.trim()).toBe('0');
  });

  it('shows the designed failure panel (alert semantics + retry) when the request fails', async () => {
    listRequest().error(new ProgressEvent('error'));
    await fixture.whenStable();

    const error = el().querySelector('[data-testid="error"]');
    expect(error).not.toBeNull();
    // Alert semantics are preserved so AT announces the failure.
    expect(error?.getAttribute('role')).toBe('alert');
    // The designed panel content: heading, reassurance copy, and a Retry action.
    expect(error?.querySelector('.failure-title')?.textContent).toContain('load the beaches');
    expect(error?.textContent).toContain('your bookings are safe');
    const retry = error?.querySelector('[data-testid="retry"]');
    expect(retry).not.toBeNull();
    expect(retry?.textContent?.trim()).toBe('Try again');
  });

  it('recovers from an initial-load failure when Retry is pressed — refetch + re-seed filters', async () => {
    listRequest().error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="error"]')).not.toBeNull();

    el().querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click();
    await fixture.whenStable();

    // Retry re-runs the failed request (the initial, unfiltered load) and recovers.
    listRequest().flush(venues());
    await fixture.whenStable();

    expect(el().querySelector('[data-testid="error"]')).toBeNull();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(2);
    // An initial-load retry re-seeds the filter selects (which the failed first load never did).
    const beachOptions = [...el().querySelectorAll('[data-testid="filter-beach"] option')].map(
      (o) => o.textContent?.trim(),
    );
    expect(beachOptions).toEqual(['All beaches', 'Dhërmi', 'Ksamil']);
  });

  it('moves keyboard focus to the persistent count block when Retry is pressed (WCAG 2.4.3)', async () => {
    listRequest().error(new ProgressEvent('error'));
    await fixture.whenStable();

    el().querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Retry tears down the panel holding the pressed button; the count block outlives every state.
    expect(document.activeElement).toBe(el().querySelector('[data-testid="results"]'));

    listRequest().flush(venues()); // settle for httpMock.verify()
  });

  it('retries the filtered request (not the initial load) when a filter-change fetch failed', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const select = el().querySelector<HTMLSelectElement>('[data-testid="filter-beach"]')!;
    select.value = 'DHERMI';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    listRequest().error(new ProgressEvent('error')); // the filtered reload fails
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="error"]')).not.toBeNull();

    el().querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click();
    await fixture.whenStable();

    // The retry carries the active beach filter — it re-ran reload(), not the unfiltered loadInitial().
    const req = listRequest();
    expect(req.request.params.get('beach')).toBe('DHERMI');
    req.flush([venues()[1]]);
    await fixture.whenStable();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(1);
  });

  it('renders no lead-time note — the rule lives on the venue surface now (#804)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    expect(el().querySelector('[data-testid="cutoff-note"]')).toBeNull();
    expect(el().querySelector('[data-testid="sales-close-note"]')).toBeNull();
  });

  it('shows the loading state before the response arrives', async () => {
    const req = listRequest(); // pending
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="loading"]')).not.toBeNull();
    req.flush(venues()); // settle for httpMock.verify()
  });

  it('renders pulsing skeleton cards, wholly decorative — the announcer carries the words', async () => {
    const req = listRequest(); // pending
    await fixture.whenStable();

    const loading = el().querySelector('[data-testid="loading"]')!;
    // Decoration only: it used to BE the live region, born holding its text (#741).
    expect(loading.getAttribute('aria-live')).toBeNull();
    expect(loading.getAttribute('aria-hidden')).toBe('true');
    const skeletons = loading.querySelectorAll('[data-testid="skeleton-card"]');
    expect(skeletons.length).toBe(6);
    expect(skeletons[0].classList.contains('animate-pulse')).toBe(true);

    req.flush(venues());
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="skeleton-card"]')).toBeNull();
  });

  it('announces through one region that survives loading → loaded (#741)', async () => {
    const req = listRequest(); // pending
    await fixture.whenStable();

    const announcer = el().querySelector('[data-testid="load-announcer"]')!;
    expect(announcer.textContent?.trim()).toBe('Loading venues…');

    req.flush(venues());
    await fixture.whenStable();

    // The SAME node, still mounted: that identity is what makes the change an announcement.
    expect(el().querySelector('[data-testid="load-announcer"]')).toBe(announcer);
    // Empty on purpose: the persistent results-count region already speaks the outcome.
    expect(announcer.textContent?.trim()).toBe('');
  });

  it('agrees the review noun with the count on the Discover card', async () => {
    // The twin of the venue-map header assertion — shared/rating.ts exists so these cannot drift.
    const [rated] = venues();
    listRequest().flush([{ ...rated, ratingTenths: 50, reviewsCount: 1 }]);
    await fixture.whenStable();

    const card = el().querySelector('[data-testid="venue-card"]')!;
    expect(card.textContent).toContain('1 review');
    expect(card.textContent).not.toContain('1 reviews');
  });
});

/**
 * The list/map switch. Below Tailwind's `lg` the two panels alternate and the map chunk loads only
 * once the venue request has settled; from `lg` up both show and the switch is gone. `matchMedia`
 * is stubbed per case (jsdom has none) and restored — the spec mutates a global.
 */
describe('Home (list/map switch)', () => {
  let httpMock: HttpTestingController;
  const originalMatchMedia = globalThis.matchMedia;

  let viewportChange: ((event: { matches: boolean }) => void) | undefined;

  function stubViewport(wide: boolean): void {
    globalThis.matchMedia = (query: string) =>
      ({
        matches: wide,
        media: query,
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
          viewportChange = listener;
        },
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
  }

  function render(wide: boolean): ComponentFixture<Home> {
    stubViewport(wide);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeOf(PRE_Q) },
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    return fixture;
  }

  function flushVenues(): void {
    httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(venues());
  }

  async function settle(fixture: ComponentFixture<Home>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function byTestId(fixture: ComponentFixture<Home>, id: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="${id}"]`,
    );
  }

  afterEach(() => {
    httpMock.verify();
    globalThis.matchMedia = originalMatchMedia;
  });

  it('starts on the list below lg, with the map panel hidden and no map chunk loaded', async () => {
    const fixture = render(false);
    flushVenues();
    await settle(fixture);

    expect(byTestId(fixture, 'view-list')?.getAttribute('aria-pressed')).toBe('true');
    expect(byTestId(fixture, 'view-map')?.getAttribute('aria-pressed')).toBe('false');
    expect(byTestId(fixture, 'list-panel')?.hidden).toBe(false);
    expect(byTestId(fixture, 'map-panel')?.hidden).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-riviera-map')).toBeNull();
  });

  it('shows the map and hides the list when Map is pressed, and back again', async () => {
    const fixture = render(false);
    flushVenues();
    await settle(fixture);

    byTestId(fixture, 'view-map')?.click();
    await settle(fixture);

    expect(byTestId(fixture, 'view-map')?.getAttribute('aria-pressed')).toBe('true');
    expect(byTestId(fixture, 'map-panel')?.hidden).toBe(false);
    expect(byTestId(fixture, 'list-panel')?.hidden).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-riviera-map')).not.toBeNull();

    byTestId(fixture, 'view-list')?.click();
    await settle(fixture);

    expect(byTestId(fixture, 'list-panel')?.hidden).toBe(false);
    expect(byTestId(fixture, 'map-panel')?.hidden).toBe(true);
  });

  it('offers Near me on the discovery map', async () => {
    const fixture = render(false);
    flushVenues();
    await settle(fixture);

    byTestId(fixture, 'view-map')?.click();
    await settle(fixture);

    expect(byTestId(fixture, 'map-near-me')?.textContent?.trim()).toBe('Near me');
  });

  it('never loads the map before the venue list has settled', async () => {
    const fixture = render(false);
    byTestId(fixture, 'view-map')?.click();
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('app-riviera-map')).toBeNull();

    flushVenues();
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('app-riviera-map')).not.toBeNull();
  });

  it('keeps a failed reload visible while the map is open below lg', async () => {
    const fixture = render(false);
    flushVenues();
    await settle(fixture);
    byTestId(fixture, 'view-map')?.click();
    await settle(fixture);

    (byTestId(fixture, 'filter-beach') as HTMLSelectElement).value = 'KSAMIL';
    byTestId(fixture, 'filter-beach')?.dispatchEvent(new Event('change'));
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    const error = byTestId(fixture, 'error');
    expect(error).not.toBeNull();
    expect(error?.closest('[hidden]')).toBeNull();
    expect(byTestId(fixture, 'map-panel')?.hidden).toBe(false);
  });

  it('moves focus off a panel that a resize below lg hides', async () => {
    const fixture = render(true);
    flushVenues();
    await settle(fixture);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    try {
      (byTestId(fixture, 'map-zoom-in') as HTMLButtonElement).focus();
      expect(document.activeElement).toBe(byTestId(fixture, 'map-zoom-in'));

      viewportChange?.({ matches: false });
      await settle(fixture);

      expect(byTestId(fixture, 'map-panel')?.hidden).toBe(true);
      expect(document.activeElement).toBe(byTestId(fixture, 'results'));
    } finally {
      (fixture.nativeElement as HTMLElement).remove();
    }
  });

  it('shows both panels side by side from lg up, without the switch', async () => {
    const fixture = render(true);
    flushVenues();
    await settle(fixture);

    expect(byTestId(fixture, 'list-panel')?.hidden).toBe(false);
    expect(byTestId(fixture, 'map-panel')?.hidden).toBe(false);
    expect(byTestId(fixture, 'view-switch')?.classList.contains('lg:hidden')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-riviera-map')).not.toBeNull();
  });
});

/**
 * The venue pins and the preview they open. The map is driven through the real seam — the fake
 * engine mounts the pin buttons into its surface, so these press the very elements a tourist
 * presses. `matchMedia` is stubbed per case and restored; the spec mutates two globals.
 */
describe('Home (venue pins and the preview)', () => {
  let httpMock: HttpTestingController;
  const originalMatchMedia = globalThis.matchMedia;
  /** Typed as a plain slot, so restoring it is not read as detaching a class method. */
  const scrollable = Element.prototype as { scrollIntoView?: (options?: unknown) => void };
  const originalScrollIntoView = scrollable.scrollIntoView;
  let scrolled: HTMLElement[];
  let routeParams: BehaviorSubject<ParamMap>;

  /** Two located venues and one without a pin, which stays in the list and draws nothing. */
  function pinnedVenues(): VenueSummary[] {
    const [miramar, aurora] = venues();
    return [
      { ...miramar, location: { latitude: 39.7712, longitude: 20.0021 } },
      { ...aurora, location: { latitude: 40.1573, longitude: 19.6401 } },
      {
        id: 3,
        name: 'Palasa Sands',
        beach: 'PALASE',
        region: 'HIMARE',
        ratingTenths: 44,
        reviewsCount: 12,
        bookingMode: 'INSTANT',
        fromPrice: { minorUnits: 2000, currency: 'EUR' },
        availability: { free: 4, total: 8 },
      },
    ];
  }

  function stubViewport(wide: boolean): void {
    globalThis.matchMedia = (query: string) =>
      ({
        matches: wide,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
  }

  function render(): ComponentFixture<Home> {
    stubViewport(true);
    TestBed.resetTestingModule();
    routeParams = new BehaviorSubject<ParamMap>(convertToParamMap(PRE_Q));
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: routeParams, snapshot: { queryParamMap: routeParams.value } },
        },
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ComponentFixture<Home>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function withPins(): Promise<ComponentFixture<Home>> {
    const fixture = render();
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(pinnedVenues());
    await settle(fixture);
    return fixture;
  }

  function el(fixture: ComponentFixture<Home>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function pins(fixture: ComponentFixture<Home>): HTMLElement[] {
    return [...el(fixture).querySelectorAll<HTMLElement>('[data-testid="map-venue-pin"]')];
  }

  function preview(fixture: ComponentFixture<Home>): HTMLElement | null {
    return el(fixture).querySelector<HTMLElement>('[data-testid="venue-preview"]');
  }

  beforeEach(() => {
    scrolled = [];
    scrollable.scrollIntoView = function scrollIntoViewStub(this: HTMLElement) {
      scrolled.push(this);
    };
  });

  afterEach(() => {
    httpMock.verify();
    globalThis.matchMedia = originalMatchMedia;
    scrollable.scrollIntoView = originalScrollIntoView;
  });

  it('draws a pin for each located venue and none for the one without a location', async () => {
    const fixture = await withPins();

    expect(pins(fixture).map((pin) => pin.getAttribute('aria-label'))).toEqual([
      'Miramar Beach Club, from €25',
      'Aurora Bay, from €30',
    ]);
    expect(el(fixture).querySelectorAll('[data-testid="venue-card"]').length).toBe(3);
  });

  it('opens the preview for the pin that was pressed', async () => {
    const fixture = await withPins();

    pins(fixture)[1].click();
    await settle(fixture);

    expect(preview(fixture)).not.toBeNull();
    expect(
      preview(fixture)?.querySelector('[data-testid="preview-name"]')?.textContent?.trim(),
    ).toBe('Aurora Bay');
    // A venue on its own walks nowhere; the deciding fact the list card carries is here too.
    expect(preview(fixture)?.querySelector('[data-testid="preview-stack"]')).toBeNull();
    expect(
      preview(fixture)
        ?.querySelector('[data-testid="preview-availability"]')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('5 of 10 free');
  });

  it('opens one preview at a time', async () => {
    const fixture = await withPins();

    pins(fixture)[0].click();
    await settle(fixture);
    pins(fixture)[1].click();
    await settle(fixture);

    expect(el(fixture).querySelectorAll('[data-testid="venue-preview"]').length).toBe(1);
    expect(
      preview(fixture)?.querySelector('[data-testid="preview-name"]')?.textContent?.trim(),
    ).toBe('Aurora Bay');
  });

  it('moves focus into the preview when it opens', async () => {
    const fixture = await withPins();

    pins(fixture)[0].click();
    await settle(fixture);

    expect(document.activeElement).toBe(preview(fixture));
  });

  it('closes on Escape and hands focus back to the pin that opened it', async () => {
    const fixture = await withPins();
    pins(fixture)[1].click();
    await settle(fixture);

    el(fixture)
      .querySelector('[data-testid="map-panel"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);

    expect(preview(fixture)).toBeNull();
    expect(document.activeElement).toBe(pins(fixture)[1]);
  });

  it('closes when the map itself is tapped', async () => {
    const fixture = await withPins();
    pins(fixture)[0].click();
    await settle(fixture);

    el(fixture)
      .querySelector('[data-testid="riviera-map-fake"]')!
      .dispatchEvent(new MouseEvent('click', { clientX: 4, clientY: 4, bubbles: true }));
    await settle(fixture);

    expect(preview(fixture)).toBeNull();
  });

  it('closes on its own close control', async () => {
    const fixture = await withPins();
    pins(fixture)[0].click();
    await settle(fixture);

    preview(fixture)!.querySelector<HTMLButtonElement>('[data-testid="preview-close"]')!.click();
    await settle(fixture);

    expect(preview(fixture)).toBeNull();
  });

  it('marks the selected venue’s card and scrolls it into view', async () => {
    const fixture = await withPins();

    pins(fixture)[1].click();
    await settle(fixture);

    const cards = [...el(fixture).querySelectorAll('[data-testid="venue-card"]')];
    expect(cards.map((card) => card.getAttribute('aria-current'))).toEqual([null, 'true', null]);
    expect(scrolled).toContain(cards[1].closest('li'));
  });

  it('marks no card once the preview is closed', async () => {
    const fixture = await withPins();
    pins(fixture)[1].click();
    await settle(fixture);

    preview(fixture)!.querySelector<HTMLButtonElement>('[data-testid="preview-close"]')!.click();
    await settle(fixture);

    const cards = [...el(fixture).querySelectorAll('[data-testid="venue-card"]')];
    expect(cards.map((card) => card.getAttribute('aria-current'))).toEqual([null, null, null]);
  });

  it('keeps the preview open when a reload still carries its venue', async () => {
    const fixture = await withPins();
    pins(fixture)[0].click();
    await settle(fixture);

    routeParams.next(convertToParamMap({ ...PRE_Q, date: '2099-08-14' }));
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(pinnedVenues());
    await settle(fixture);

    expect(preview(fixture)).not.toBeNull();
    expect(
      preview(fixture)?.querySelector('[data-testid="preview-name"]')?.textContent?.trim(),
    ).toBe('Miramar Beach Club');
  });

  it('never strands focus when the previewed venue leaves the list under an open card', async () => {
    const fixture = await withPins();
    pins(fixture)[0].click();
    await settle(fixture);
    expect(document.activeElement).toBe(preview(fixture));

    // Nobody closed it: the day changed under the open card and the venue left the result set.
    routeParams.next(convertToParamMap({ ...PRE_Q, date: '2099-08-14' }));
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(pinnedVenues().slice(1));
    await settle(fixture);

    expect(preview(fixture)).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(el(fixture).querySelector('[data-testid="results"]'));
  });

  it('re-feeds the pins and drops the preview when a filter changes the result set', async () => {
    const fixture = await withPins();
    pins(fixture)[1].click();
    await settle(fixture);

    const select = el(fixture).querySelector<HTMLSelectElement>('[data-testid="filter-beach"]')!;
    select.value = 'KSAMIL';
    select.dispatchEvent(new Event('change'));
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush([pinnedVenues()[0]]);
    await settle(fixture);

    expect(pins(fixture).map((pin) => pin.getAttribute('aria-label'))).toEqual([
      'Miramar Beach Club, from €25',
    ]);
    expect(preview(fixture)).toBeNull();
  });

  function mapHandle(fixture: ComponentFixture<Home>): FakeMapHandle {
    const map = fixture.debugElement.query(By.directive(RivieraMap))
      .componentInstance as RivieraMap;
    return map.handle() as FakeMapHandle;
  }

  /** The Ksamil pair — ~120 m apart, one blob at the opening view — beside the lone Dhërmi venue. */
  function crowdedVenues(): VenueSummary[] {
    const [miramar, aurora] = pinnedVenues();
    return [
      miramar,
      {
        ...miramar,
        id: 4,
        name: 'Lori Beach',
        fromPrice: { minorUnits: 2100, currency: 'EUR' },
        location: { latitude: 39.77227, longitude: 20.00317 },
      },
      aurora,
    ];
  }

  /** Three venues on one spot at Dhërmi: no zoom the map offers separates them. */
  function inseparableVenues(): VenueSummary[] {
    const [, aurora] = pinnedVenues();
    return [
      aurora,
      { ...aurora, id: 5, name: 'Folie Marine', fromPrice: { minorUnits: 3900, currency: 'EUR' } },
      {
        ...aurora,
        id: 6,
        name: 'Dhërmi Sun Club',
        fromPrice: { minorUnits: 1800, currency: 'EUR' },
      },
    ];
  }

  async function withVenues(list: VenueSummary[]): Promise<ComponentFixture<Home>> {
    const fixture = render();
    httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(list);
    await settle(fixture);
    return fixture;
  }

  function beachSelect(fixture: ComponentFixture<Home>): HTMLSelectElement {
    return el(fixture).querySelector<HTMLSelectElement>('[data-testid="filter-beach"]')!;
  }

  function regionSelect(fixture: ComponentFixture<Home>): HTMLSelectElement {
    return el(fixture).querySelector<HTMLSelectElement>('[data-testid="filter-region"]')!;
  }

  it('hands the engine no venue markers: the layer draws the pins from the cards the list renders', async () => {
    const fixture = await withPins();

    expect(mapHandle(fixture).markers().size).toBe(0);
    expect(pins(fixture).map((pin) => pin.closest('app-venue-pin-layer'))).not.toContain(null);
  });

  it('keeps the pins and the open preview while a reload is in flight', async () => {
    const fixture = await withPins();
    pins(fixture)[0].click();
    await settle(fixture);
    const [before] = pins(fixture);

    routeParams.next(convertToParamMap({ ...PRE_Q, date: '2099-08-14' }));
    await settle(fixture);

    expect(el(fixture).querySelector('[data-testid="loading"]')).not.toBeNull();
    expect(pins(fixture)[0]).toBe(before);
    expect(preview(fixture)).not.toBeNull();
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(pinnedVenues());
    await settle(fixture);
    expect(pins(fixture)[0]).toBe(before);
    expect(preview(fixture)).not.toBeNull();
  });

  it('narrows the Beach filter when a place is pressed and the crumb undoes it', async () => {
    const fixture = await withVenues(crowdedVenues());
    document.body.appendChild(el(fixture));
    try {
      const pill = el(fixture).querySelector<HTMLButtonElement>('[data-testid="map-place-pill"]')!;
      expect(pill.getAttribute('aria-label')).toBe(
        '2 venues at Ksamil, from €21; press to zoom to them',
      );
      expect(el(fixture).querySelector('[data-testid="map-beach-crumb"]')).toBeNull();
      pill.focus();

      pill.click();
      await settle(fixture);

      const request = httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`);
      expect(request.request.params.get('beach')).toBe('KSAMIL');
      request.flush(crowdedVenues().slice(0, 2));
      await settle(fixture);

      expect(beachSelect(fixture).value).toBe('KSAMIL');
      const crumb = el(fixture).querySelector<HTMLButtonElement>(
        '[data-testid="map-beach-crumb"]',
      )!;
      expect(crumb.textContent?.replace(/\s+/g, ' ').trim()).toBe('Ksamil ×');
      expect(crumb.getAttribute('aria-label')).toBe(
        'Showing Ksamil only; press to show all beaches',
      );
      expect(pins(fixture).map((pin) => pin.getAttribute('aria-label'))).toEqual([
        'Miramar Beach Club, from €25',
        'Lori Beach, from €21',
      ]);
      expect(pins(fixture)[0]).toBe(pill);
      expect(document.activeElement).toBe(pill);
      expect(el(fixture).querySelectorAll('[data-testid="venue-card"]').length).toBe(2);

      crumb.click();
      await settle(fixture);
      const all = httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`);
      expect(all.request.params.has('beach')).toBe(false);
      all.flush(crowdedVenues());
      await settle(fixture);

      expect(beachSelect(fixture).value).toBe('');
      expect(el(fixture).querySelector('[data-testid="map-beach-crumb"]')).toBeNull();
      expect(el(fixture).querySelectorAll('[data-testid="venue-card"]').length).toBe(3);
      expect(document.activeElement).toBe(el(fixture).querySelector('[data-testid="map-near-me"]'));
    } finally {
      el(fixture).remove();
    }
  });

  it('shows the crumb for a beach chosen in the select too, since the map shows what the list is narrowed to', async () => {
    const fixture = await withPins();

    beachSelect(fixture).value = 'KSAMIL';
    beachSelect(fixture).dispatchEvent(new Event('change'));
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush([pinnedVenues()[0]]);
    await settle(fixture);

    expect(
      el(fixture).querySelector('[data-testid="map-beach-crumb"]')?.textContent?.trim(),
    ).toContain('Ksamil');
  });

  it('eases the map to the chosen beach, then its region, then back to the riviera as the filters change', async () => {
    const fixture = await withPins();
    const list = () =>
      httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush([]);

    beachSelect(fixture).value = 'DHERMI';
    beachSelect(fixture).dispatchEvent(new Event('change'));
    list();
    await settle(fixture);
    expect(mapHandle(fixture).view()).toEqual({ center: { lng: 19.645, lat: 40.145 }, zoom: 13 });

    regionSelect(fixture).value = 'HIMARE';
    regionSelect(fixture).dispatchEvent(new Event('change'));
    list();
    beachSelect(fixture).value = '';
    beachSelect(fixture).dispatchEvent(new Event('change'));
    list();
    await settle(fixture);
    expect(mapHandle(fixture).view()).toEqual({ center: { lng: 19.75, lat: 40.08 }, zoom: 10 });

    regionSelect(fixture).value = '';
    regionSelect(fixture).dispatchEvent(new Event('change'));
    list();
    await settle(fixture);
    expect(mapHandle(fixture).view()).toEqual(RIVIERA_MAP_OPTIONS.view);
  });

  it('lists only catalogue beaches and regions that have a venue, in coast order, by label', async () => {
    const fixture = await withPins();

    const options = (id: string) =>
      [...el(fixture).querySelectorAll(`[data-testid="${id}"] option`)].map((o) => [
        (o as HTMLOptionElement).value,
        o.textContent?.trim(),
      ]);
    expect(options('filter-beach')).toEqual([
      ['', 'All beaches'],
      ['PALASE', 'Palasë'],
      ['DHERMI', 'Dhërmi'],
      ['KSAMIL', 'Ksamil'],
    ]);
    expect(options('filter-region')).toEqual([
      ['', 'All regions'],
      ['HIMARE', 'Himarë'],
      ['SARANDE', 'Sarandë'],
    ]);
  });

  it("presses through an inseparable crowd's previews from the map", async () => {
    const fixture = await withVenues(inseparableVenues());
    mapHandle(fixture).setView({
      center: { lng: 19.6401, lat: 40.1573 },
      zoom: RIVIERA_MAP_OPTIONS.maxZoom,
    });
    await settle(fixture);
    const pill = el(fixture).querySelector<HTMLButtonElement>('[data-testid="map-place-pill"]')!;
    expect(pill.hasAttribute('data-here')).toBe(true);

    pill.click();
    await settle(fixture);
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.apiBaseUrl}/api/venues` && r.params.get('beach') === 'DHERMI',
      )
      .flush(inseparableVenues());
    await settle(fixture);

    expect(
      preview(fixture)?.querySelector('[data-testid="preview-name"]')?.textContent?.trim(),
    ).toBe('Aurora Bay');
    expect(document.activeElement).toBe(preview(fixture));
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(pill.textContent?.replace(/\s+/g, ' ').trim()).toBe('Aurora Bay from €30 1/3');

    pill.click();
    await settle(fixture);

    expect(
      preview(fixture)?.querySelector('[data-testid="preview-name"]')?.textContent?.trim(),
    ).toBe('Folie Marine');
    const [, folie] = el(fixture).querySelectorAll<HTMLButtonElement>('app-venue-pin-layer button');
    expect(folie.dataset['testid']).toBe('map-place-pill');

    el(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);

    expect(preview(fixture)).toBeNull();
    expect(document.activeElement).toBe(folie);
  });

  it("walks an inseparable crowd from the preview card's stepper, wrapping, with focus kept on the chevron", async () => {
    const fixture = await withVenues(inseparableVenues());
    document.body.appendChild(el(fixture));
    try {
      mapHandle(fixture).setView({
        center: { lng: 19.6401, lat: 40.1573 },
        zoom: RIVIERA_MAP_OPTIONS.maxZoom,
      });
      await settle(fixture);
      const pill = el(fixture).querySelector<HTMLButtonElement>('[data-testid="map-place-pill"]')!;
      pill.click();
      await settle(fixture);
      httpMock
        .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
        .flush(inseparableVenues());
      await settle(fixture);
      const card = preview(fixture)!;
      const name = (): string =>
        card.querySelector('[data-testid="preview-name"]')?.textContent?.trim() ?? '';
      const position = (): string =>
        card
          .querySelector('[data-testid="preview-stack-position"]')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? '';
      expect(name()).toBe('Aurora Bay');
      expect(position()).toBe('1 of 3 here, Aurora Bay');
      const next = card.querySelector<HTMLButtonElement>('[data-testid="preview-stack-next"]')!;
      const prev = card.querySelector<HTMLButtonElement>('[data-testid="preview-stack-prev"]')!;

      next.focus();
      next.click();
      await settle(fixture);

      // The same dialog, re-fed: the pressed chevron is still the focused element.
      expect(preview(fixture)).toBe(card);
      expect(name()).toBe('Folie Marine');
      expect(position()).toBe('2 of 3 here, Folie Marine');
      expect(document.activeElement).toBe(next);
      // The pill follows the open venue: it is now Folie's own button, wearing its name and place.
      const face = el(fixture).querySelector<HTMLButtonElement>('[data-testid="map-place-pill"]')!;
      expect(face).not.toBe(pill);
      expect(face.textContent?.replace(/\s+/g, ' ').trim()).toBe('Folie Marine from €39 2/3');

      next.click();
      await settle(fixture);
      expect(name()).toBe('Dhërmi Sun Club');
      next.click();
      await settle(fixture);
      expect(name()).toBe('Aurora Bay');
      expect(position()).toBe('1 of 3 here, Aurora Bay');

      prev.click();
      await settle(fixture);
      expect(name()).toBe('Dhërmi Sun Club');
      expect(position()).toBe('3 of 3 here, Dhërmi Sun Club');
      expect(document.activeElement).toBe(next);

      el(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(fixture);

      expect(preview(fixture)).toBeNull();
      expect(document.activeElement?.getAttribute('data-pin')).toBe('6');
    } finally {
      el(fixture).remove();
    }
  });
});

/**
 * The riviera map sheet, which is what `/` renders: below `lg` the map is the
 * ground, the list a sheet over it, the head one row carrying the query, the row the pin's
 * preview, and Near me three arms decided by the map's own fence rule. What jsdom cannot lay out
 * — the rest points, the flicks, the first row's y — is `discover-sheet.e2e.ts`'s.
 */
describe('Home (the riviera map sheet — what `/` renders)', () => {
  let httpMock: HttpTestingController;
  let geolocation: FakeGeolocationGateway;
  let engine: FakeMapEngine;
  let makeEngine: () => FakeMapEngine = () => new FakeMapEngine();
  const originalMatchMedia = globalThis.matchMedia;
  const scrollable = Element.prototype as { scrollTo?: (options: ScrollToOptions) => void };
  const originalScrollTo = scrollable.scrollTo;
  /** Every `scrollTo` asked of any element, in order — the sheet's rests among them. */
  let asked: number[];

  const ROME = { lng: 12.5, lat: 41.9 };
  const TIRANA = { lng: 19.82, lat: 41.33 };
  const ON_DHERMI = { lng: 19.64, lat: 40.15 };

  /** Five pinned venues over three regions; Palasa Sands has closed its sales for today. */
  function sheetVenues(): VenueSummary[] {
    const [miramar, aurora] = venues();
    return [
      { ...miramar, location: { latitude: 39.7712, longitude: 20.0021 } },
      { ...aurora, location: { latitude: 40.1573, longitude: 19.6401 } },
      {
        id: 3,
        name: 'Palasa Sands',
        beach: 'PALASE',
        region: 'HIMARE',
        ratingTenths: 44,
        reviewsCount: 12,
        bookingMode: 'INSTANT',
        fromPrice: { minorUnits: 2000, currency: 'EUR' },
        availability: { free: 4, total: 8 },
        salesOpen: false,
        location: { latitude: 40.175, longitude: 19.607 },
      },
      {
        id: 7,
        name: 'Golem Beach Bar',
        beach: 'GOLEM',
        region: 'DURRES',
        ratingTenths: 40,
        reviewsCount: 5,
        bookingMode: 'INSTANT',
        fromPrice: { minorUnits: 1500, currency: 'EUR' },
        availability: { free: 9, total: 12 },
        location: { latitude: 41.24, longitude: 19.51 },
      },
      {
        id: 8,
        name: 'Qerret Loungers',
        beach: 'QERRET',
        region: 'DURRES',
        ratingTenths: 39,
        reviewsCount: 3,
        bookingMode: 'REQUEST',
        fromPrice: { minorUnits: 1800, currency: 'EUR' },
        availability: { free: 6, total: 10 },
        location: { latitude: 41.21, longitude: 19.51 },
      },
    ];
  }

  function stubViewport(wide: boolean): void {
    globalThis.matchMedia = (query: string) =>
      ({
        matches: wide,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
  }

  function render(query: Record<string, string>, wide = false): ComponentFixture<Home> {
    stubViewport(wide);
    TestBed.resetTestingModule();
    const params = new BehaviorSubject<ParamMap>(convertToParamMap(query));
    geolocation = new FakeGeolocationGateway();
    engine = makeEngine();
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
        },
        { provide: MapEngine, useValue: engine },
        { provide: GeolocationGateway, useValue: geolocation },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ComponentFixture<Home>): Promise<void> {
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  async function sheetPage(): Promise<ComponentFixture<Home>> {
    const fixture = render({});
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(sheetVenues());
    await settle(fixture);
    return fixture;
  }

  function el(fixture: ComponentFixture<Home>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(fixture: ComponentFixture<Home>, id: string): HTMLElement | null {
    return el(fixture).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function text(node: Element | null | undefined): string {
    return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function cardNames(fixture: ComponentFixture<Home>): string[] {
    return [...el(fixture).querySelectorAll('[data-testid="venue-card"] .card-name')].map(text);
  }

  function groupHeads(fixture: ComponentFixture<Home>): string[] {
    return [...el(fixture).querySelectorAll('[data-testid="sheet-group"]')].map(text);
  }

  /** jsdom gives every element a box of nothing; this is the box a browser would give it. */
  function lay(element: Element, box: (self: Element) => DOMRect): void {
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => box(element));
  }

  function layer(fixture: ComponentFixture<Home>): VenuePinLayer {
    return fixture.debugElement.query(By.directive(VenuePinLayer))
      .componentInstance as VenuePinLayer;
  }

  function sheet(fixture: ComponentFixture<Home>): DiscoverSheet {
    return fixture.debugElement.query(By.directive(DiscoverSheet))
      .componentInstance as DiscoverSheet;
  }

  async function locateAt(
    fixture: ComponentFixture<Home>,
    outcome: Parameters<FakeGeolocationGateway['answerWith']>[0],
  ): Promise<void> {
    byTestId(fixture, 'sheet-near-me')!.click();
    geolocation.answerWith(outcome);
    await settle(fixture);
  }

  beforeEach(() => {
    asked = [];
    scrollable.scrollTo = function scrollToStub(this: HTMLElement, options: ScrollToOptions) {
      const top = options.top ?? 0;
      asked.push(top);
      this.scrollTop = top;
      this.dispatchEvent(new Event('scroll'));
    };
  });

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
    scrollable.scrollTo = originalScrollTo;
    httpMock.verify();
  });

  /**
   * The route's whole `map` contract, as a tourist's URL crosses it. The riviera map is what `/`
   * renders; `?map=off` is the one way back to the pre-Q page while it soaks, and every other
   * value — the `?map=sheet` a bookmark from the flagged releases still carries among them — is
   * the map, so no link that used to work breaks.
   */
  it('with no query parameter the page is the riviera map sheet', async () => {
    const fixture = await sheetPage();

    expect(byTestId(fixture, 'sheet-scroller')).not.toBeNull();
    expect(byTestId(fixture, 'head-day')).not.toBeNull();
    expect(byTestId(fixture, 'filter-beach')).toBeNull();
    expect(byTestId(fixture, 'view-switch')).toBeNull();
  });

  it('?map=sheet still resolves to the riviera map sheet — a no-op, not an error', async () => {
    const fixture = render({ map: 'sheet' });
    httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(venues());
    await settle(fixture);

    expect(byTestId(fixture, 'sheet-scroller')).not.toBeNull();
    expect(byTestId(fixture, 'filter-beach')).toBeNull();
  });

  it('?map=off is today’s Discover', async () => {
    const fixture = render(PRE_Q);
    httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(venues());
    await settle(fixture);

    expect(byTestId(fixture, 'sheet-scroller')).toBeNull();
    expect(byTestId(fixture, 'filter-beach')).not.toBeNull();
    expect(byTestId(fixture, 'view-switch')).not.toBeNull();
  });

  it('with no query parameter from lg up, the list is a pinned panel beside the map: no sheet, no filter bar', async () => {
    const fixture = render({}, true);
    httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(venues());
    await settle(fixture);

    expect(byTestId(fixture, 'desk-panel')).not.toBeNull();
    expect(byTestId(fixture, 'desk-pane')).not.toBeNull();
    expect(byTestId(fixture, 'sheet-scroller')).toBeNull();
    expect(byTestId(fixture, 'filter-beach')).toBeNull();
    expect(byTestId(fixture, 'view-switch')).toBeNull();
    // The same head as the phone's, carrying the same query.
    expect(byTestId(fixture, 'head-place')).not.toBeNull();
    expect(byTestId(fixture, 'head-day')).not.toBeNull();
  });

  it('below lg the map is the ground and the list is the sheet; the filter bar, the switch and the preview card are gone', async () => {
    const fixture = await sheetPage();

    expect(byTestId(fixture, 'sheet-scroller')).not.toBeNull();
    expect(byTestId(fixture, 'riviera-map-fake')).not.toBeNull();
    expect(byTestId(fixture, 'filter-beach')).toBeNull();
    expect(byTestId(fixture, 'view-switch')).toBeNull();
    expect(byTestId(fixture, 'map-zoom-in')).toBeNull();
    expect(byTestId(fixture, 'map-near-me')).toBeNull();
    expect(byTestId(fixture, 'sheet-near-me')).not.toBeNull();
    expect(byTestId(fixture, 'map-attribution')).not.toBeNull();
  });

  it('opens on Himarë: its venues by beach, its beaches in the chip, the selling line from the server’s verdict', async () => {
    const fixture = await sheetPage();

    expect(text(byTestId(fixture, 'head-title'))).toBe('Himarë');
    expect(text(byTestId(fixture, 'head-subtitle'))).toBe('1 of 2 selling today');
    expect(byTestId(fixture, 'head-beaches')?.getAttribute('aria-label')).toBe(
      'All 2 beaches: choose one',
    );
    expect(groupHeads(fixture)).toEqual(['Palasë 1 venue', 'Dhërmi 1 venue']);
    expect(cardNames(fixture)).toEqual(['Palasa Sands', 'Aurora Bay']);
    // The pins are the region's, not the coast's.
    expect(el(fixture).querySelectorAll('[data-pin]').length).toBe(2);
  });

  it('wears dusk on a row whose sales for today have closed, desaturated and badged, never faded', async () => {
    const fixture = await sheetPage();
    const rows = [...el(fixture).querySelectorAll<HTMLElement>('[data-testid="venue-card"]')];

    expect(rows[0].classList.contains('saturate-0')).toBe(true);
    expect(rows[0].querySelector('app-sales-closed-chip')).not.toBeNull();
    expect(rows[1].classList.contains('saturate-0')).toBe(false);
    expect([...rows[0].classList].some((cls) => cls.startsWith('opacity-'))).toBe(false);
  });

  it('a pin press lights its row, hands it to the sheet to lift, and opens no preview card', async () => {
    const fixture = await sheetPage();
    const reveal = vi.spyOn(sheet(fixture), 'reveal');

    el(fixture).querySelector<HTMLButtonElement>('[data-pin="2"]')!.click();
    await settle(fixture);

    const lit = el(fixture).querySelector('[data-venue-pin="2"]')!;
    expect(lit.hasAttribute('data-selected')).toBe(true);
    expect(lit.querySelector('[data-testid="venue-card"]')?.getAttribute('aria-current')).toBe(
      'true',
    );
    expect(reveal).toHaveBeenCalledWith(lit);
    expect(byTestId(fixture, 'venue-preview')).toBeNull();
  });

  it('a chip pressed at peek raises the sheet to half before its rail opens', async () => {
    const fixture = await sheetPage();
    const scroller = byTestId(fixture, 'sheet-scroller')!;
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await settle(fixture);
    expect(sheet(fixture).detent()).toBe('peek');
    expect(el(fixture).querySelector('[role="group"][aria-label="Day"]')).toBeNull();
    asked = [];

    byTestId(fixture, 'head-day')!.click();
    await settle(fixture);

    const tops = sheet(fixture).tops();
    expect(asked).toContain(tops.peek - tops.half);
    expect(sheet(fixture).detent()).toBe('half');
    expect(el(fixture).querySelector('[role="group"][aria-label="Day"]')).not.toBeNull();
  });

  it('Near me from outside the fence leaves the map and the list unchanged and shows the map’s words in the head', async () => {
    const fixture = await sheetPage();
    const map = fixture.debugElement.query(By.directive(RivieraMap))
      .componentInstance as RivieraMap;
    const before = map.handle()!.view();

    await locateAt(fixture, { kind: 'located', at: ROME });

    expect(text(byTestId(fixture, 'head-note'))).toBe(
      'You don’t seem to be on the Albanian riviera — the map hasn’t moved.',
    );
    expect(text(byTestId(fixture, 'head-title'))).toBe('Himarë');
    expect(cardNames(fixture)).toEqual(['Palasa Sands', 'Aurora Bay']);
    expect(byTestId(fixture, 'here-dot')).toBeNull();
    expect(map.handle()!.view()).toEqual(before);

    byTestId(fixture, 'head-note-dismiss')!.click();
    await settle(fixture);
    expect(byTestId(fixture, 'head-note')).toBeNull();
  });

  it('Near me from Tirana frames the tourist with the coast nearest first, titled by the region', async () => {
    const fixture = await sheetPage();
    const map = fixture.debugElement.query(By.directive(RivieraMap))
      .componentInstance as RivieraMap;
    const before = map.handle()!.view();

    await locateAt(fixture, { kind: 'located', at: TIRANA });

    expect(text(byTestId(fixture, 'head-title'))).toBe('Durrës');
    expect(byTestId(fixture, 'head-located')).not.toBeNull();
    expect(groupHeads(fixture)).toEqual(['Golem 28 km 1 venue', 'Qerret 29 km 1 venue']);
    expect(cardNames(fixture)).toEqual(['Golem Beach Bar', 'Qerret Loungers']);
    expect(byTestId(fixture, 'here-dot')).not.toBeNull();
    // The camera re-fits to the dot and the pins together: a 27 km span, so well under the ceiling of 14.
    const view = map.handle()!.view();
    expect(view).not.toEqual(before);
    expect(view.zoom).toBeLessThan(12);
    expect(view.center.lat).toBeGreaterThan(41.0);
    // And the dot is projected through that camera, not the one before it.
    const dot = byTestId(fixture, 'here-dot')!;
    const at = map.handle()!.project(TIRANA);
    expect(Number.parseFloat(dot.style.left)).toBeCloseTo(at.x, 3);
    expect(Number.parseFloat(dot.style.top)).toBeCloseTo(at.y, 3);
    expect(text(byTestId(fixture, 'sheet-near-me'))).toBe('◎ You are here');
  });

  it('Near me on the beach titles the beach', async () => {
    const fixture = await sheetPage();

    await locateAt(fixture, { kind: 'located', at: ON_DHERMI });

    expect(text(byTestId(fixture, 'head-title'))).toBe('Dhërmi');
    expect(groupHeads(fixture)[0]).toMatch(/^Dhërmi 0\.\d km 1 venue$/);
  });

  it('a declined position shows the map’s words for it', async () => {
    const fixture = await sheetPage();

    await locateAt(fixture, { kind: 'denied' });

    expect(text(byTestId(fixture, 'head-note'))).toBe(
      'Location permission was declined. The map hasn’t moved.',
    );
  });

  it('a crowd press narrows to its beach: the chip lights, the rows are the beach’s, the title is the beach', async () => {
    const fixture = await sheetPage();
    const layer = fixture.debugElement.query(By.directive(VenuePinLayer))
      .componentInstance as VenuePinLayer;

    layer.narrowed.emit('DHERMI');
    await settle(fixture);

    expect(byTestId(fixture, 'head-beaches')?.getAttribute('aria-current')).toBe('true');
    expect(text(byTestId(fixture, 'head-title'))).toBe('Dhërmi');
    expect(cardNames(fixture)).toEqual(['Aurora Bay']);

    byTestId(fixture, 'head-beaches')!.click();
    await settle(fixture);
    el(fixture)
      .querySelector<HTMLButtonElement>('[role="group"][aria-label="Beach"] button')!
      .click();
    await settle(fixture);
    expect(cardNames(fixture)).toEqual(['Palasa Sands', 'Aurora Bay']);
  });

  it('the place opens the coast picker; a pick moves the region and hands focus back to the place', async () => {
    const fixture = await sheetPage();

    byTestId(fixture, 'head-place')!.click();
    await settle(fixture);
    const rows = [...el(fixture).querySelectorAll<HTMLElement>('[data-testid="picker-row"]')];
    expect(rows.map(text)).toEqual([
      'Durrës 2 venues from €15',
      'Golem 1 venue from €15',
      'Qerret 1 venue from €18',
      'Himarë 2 venues from €20',
      'Palasë 1 venue from €20',
      'Dhërmi 1 venue from €30',
      'Sarandë 1 venue from €25',
      'Ksamil 1 venue from €25',
    ]);

    rows[0].click();
    await settle(fixture);

    expect(byTestId(fixture, 'coast-picker')).toBeNull();
    expect(text(byTestId(fixture, 'head-title'))).toBe('Durrës');
    expect(cardNames(fixture)).toEqual(['Golem Beach Bar', 'Qerret Loungers']);
    expect(document.activeElement).toBe(byTestId(fixture, 'head-place'));
  });

  it('a day pick re-counts the day with one unfiltered request, keeping the place', async () => {
    const fixture = await sheetPage();
    byTestId(fixture, 'head-day')!.click();
    await settle(fixture);
    const chips = [
      ...el(fixture).querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Day"] button'),
    ];

    chips[1].click();
    await settle(fixture);

    const request = httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`);
    expect(request.request.params.get('date')).toBe('2026-06-16');
    expect(request.request.params.has('beach')).toBe(false);
    expect(request.request.params.has('region')).toBe(false);
    request.flush(sheetVenues());
    await settle(fixture);
    expect(text(byTestId(fixture, 'head-subtitle'))).toBe('2 venues');
    expect(text(byTestId(fixture, 'head-day'))).toBe('Tomorrow ▾');
    expect(text(byTestId(fixture, 'head-title'))).toBe('Himarë');
  });

  it('speaks the landed list and every narrowing from one persistent outcome region', async () => {
    const fixture = await sheetPage();
    const outcome = byTestId(fixture, 'sheet-outcome')!;
    expect(outcome.getAttribute('aria-live')).toBe('polite');
    expect(text(outcome)).toBe('Himarë: 1 of 2 selling today');

    byTestId(fixture, 'head-beaches')!.click();
    await settle(fixture);
    [
      ...el(fixture).querySelectorAll<HTMLButtonElement>(
        '[role="group"][aria-label="Beach"] button',
      ),
    ]
      .find((chip) => text(chip).startsWith('Dhërmi'))!
      .click();
    await settle(fixture);
    expect(byTestId(fixture, 'sheet-outcome')).toBe(outcome);
    expect(text(outcome)).toBe('Dhërmi: 1 of 1 selling today');

    // A reload empties the words and the same element speaks the next list.
    byTestId(fixture, 'head-day')!.click();
    await settle(fixture);
    el(fixture)
      .querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Day"] button')[1]
      .click();
    await settle(fixture);
    expect(byTestId(fixture, 'sheet-outcome')).toBe(outcome);
    expect(text(outcome)).toBe('');
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(sheetVenues());
    await settle(fixture);
    expect(byTestId(fixture, 'sheet-outcome')).toBe(outcome);
    expect(text(outcome)).toBe('Dhërmi: 1 venue');
  });

  it('Escape clears the lit row and closes an open rail', async () => {
    const fixture = await sheetPage();
    el(fixture).querySelector<HTMLButtonElement>('[data-pin="2"]')!.click();
    byTestId(fixture, 'head-day')!.click();
    await settle(fixture);
    expect(el(fixture).querySelector('[data-selected]')).not.toBeNull();

    el(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);

    expect(el(fixture).querySelector('[data-selected]')).toBeNull();
    expect(el(fixture).querySelector('[role="group"][aria-label="Day"]')).toBeNull();
  });

  /**
   * On a phone the sheet opens on the **map poster**: a still of the region under the pins,
   * projected through the still handle, with no engine created until something has to move
   * the camera — then the live map takes over at the poster's own camera.
   */
  describe('on a phone: the poster', () => {
    const PHONE = { width: 390, height: 844 };
    const originalSize = { width: window.innerWidth, height: window.innerHeight };

    /** The fake's surface with the phone's box, since jsdom lays nothing out: the live map projects around the pane's centre as in a browser. */
    class BoxedFakeMapEngine extends FakeMapEngine {
      override create(host: HTMLElement, options: MapEngineOptions): Promise<FakeMapHandle> {
        const created = super.create(host, options);
        const surface = host.querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!;
        surface.getBoundingClientRect = () =>
          ({ x: 0, y: 0, left: 0, top: 0, width: PHONE.width, height: PHONE.height }) as DOMRect;
        return created;
      }
    }

    function useViewport({ width, height }: { width: number; height: number }): void {
      window.innerWidth = width;
      window.innerHeight = height;
    }

    function pinBoxes(fixture: ComponentFixture<Home>): [number, number][] {
      return [...el(fixture).querySelectorAll<HTMLElement>('[data-pin]')].map((pin) => [
        Number.parseFloat(pin.style.left),
        Number.parseFloat(pin.style.top),
      ]);
    }

    /** The still handle the page projects through for Himarë, rebuilt here from the same catalogue. */
    function himareStill(): PosterHandle {
      const poster = posterFor('HIMARE', '', PHONE)!;
      return new PosterHandle(poster.camera, PHONE.width, poster.bucket.height, () => undefined);
    }

    async function loaded(fixture: ComponentFixture<Home>): Promise<FakeMapHandle> {
      await settle(fixture);
      const map = fixture.debugElement.query(By.directive(RivieraMap))
        .componentInstance as RivieraMap;
      await settle(fixture);
      expect(map.loaded()).toBe(true);
      return map.handle() as FakeMapHandle;
    }

    beforeEach(() => {
      useViewport(PHONE);
      makeEngine = () => new BoxedFakeMapEngine();
    });
    afterEach(() => {
      useViewport(originalSize);
      makeEngine = () => new FakeMapEngine();
    });

    it('opens on the poster: no engine created, the pins drawn through the still handle, the credit on the foot row', async () => {
      const fixture = await sheetPage();

      expect(engine.created).toHaveLength(0);
      expect(byTestId(fixture, 'riviera-map-fake')).toBeNull();
      expect(byTestId(fixture, 'map-placeholder')).toBeNull();
      const image = byTestId(fixture, 'poster-image') as HTMLImageElement;
      expect(image.getAttribute('src')).toBe('/posters/HIMARE-440@2x.jpg');
      expect(image.getAttribute('srcset')).toBe(
        '/posters/HIMARE-440@2x.jpg 2x, /posters/HIMARE-440@3x.jpg 3x',
      );
      expect(image.getAttribute('fetchpriority')).toBe('high');
      expect(image.getAttribute('alt')).toBe('');
      expect(byTestId(fixture, 'sheet-poster')?.getAttribute('aria-label')).toBe('Move the map');

      // Himarë's two pins crowd at the poster's zoom, so the layer draws one place pill at the crowd's spot.
      const still = himareStill();
      const pins = [...el(fixture).querySelectorAll<HTMLElement>('[data-pin]')];
      expect(pins).toHaveLength(2);
      expect(byTestId(fixture, 'map-place-pill')).not.toBeNull();
      const palase = still.project({ lng: 19.607, lat: 40.175 });
      const dhermi = still.project({ lng: 19.6401, lat: 40.1573 });
      const [x, y] = pinBoxes(fixture)[0];
      expect(x).toBeCloseTo((palase.x + dhermi.x) / 2, 3);
      expect(y).toBeCloseTo((palase.y + dhermi.y) / 2, 3);

      const credit = byTestId(fixture, 'map-attribution')!;
      expect(credit.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        '© OpenMapTiles © OpenStreetMap contributors',
      );
      expect(credit.querySelectorAll('a')).toHaveLength(2);
      expect(byTestId(fixture, 'sheet-near-me')).not.toBeNull();
    });

    it('a finger on the ground wakes the live map at the poster’s camera, and nothing moves', async () => {
      const fixture = await sheetPage();
      const before = pinBoxes(fixture);

      // A mouse press focuses the button it lands on, so the poster holds focus as it leaves.
      const poster = byTestId(fixture, 'sheet-poster')!;
      poster.focus();
      poster.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      const handle = await loaded(fixture);

      expect(engine.created).toHaveLength(1);
      expect(engine.created[0].options.view).toEqual(himareStill().liveView(PHONE));
      expect(handle.view()).toEqual(himareStill().liveView(PHONE));
      expect(byTestId(fixture, 'sheet-poster')).toBeNull();
      expect(byTestId(fixture, 'riviera-map-fake')).not.toBeNull();
      // Focus is handed to the live map's region rather than stranded on <body> (WCAG 2.4.3).
      expect(document.activeElement).toBe(byTestId(fixture, 'sheet-map'));
      expect(byTestId(fixture, 'sheet-map')?.getAttribute('aria-label')).toBe('Map of the riviera');
      const after = pinBoxes(fixture);
      expect(after).toHaveLength(before.length);
      for (const [index, [x, y]] of after.entries()) {
        expect(Math.abs(x - before[index][0])).toBeLessThanOrEqual(1);
        expect(Math.abs(y - before[index][1])).toBeLessThanOrEqual(1);
      }
    });

    it('shows one credit while the live map is on its way: the poster’s yields to the map’s', async () => {
      // An engine whose boot waits: the map component is mounted (with its own credit) but not loaded.
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      class HeldFakeMapEngine extends BoxedFakeMapEngine {
        override async create(
          host: HTMLElement,
          options: MapEngineOptions,
        ): Promise<FakeMapHandle> {
          await held;
          return super.create(host, options);
        }
      }
      makeEngine = () => new HeldFakeMapEngine();
      const fixture = await sheetPage();
      expect(el(fixture).querySelectorAll('[data-testid="map-attribution"]')).toHaveLength(1);

      byTestId(fixture, 'sheet-poster')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      // Not `settle`: the held boot is a pending task, so the fixture never reports stable.
      for (let pass = 0; pass < 5; pass += 1) {
        fixture.detectChanges();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      expect(fixture.debugElement.query(By.directive(RivieraMap))).not.toBeNull();
      expect(byTestId(fixture, 'sheet-poster')).not.toBeNull();
      expect(el(fixture).querySelectorAll('[data-testid="map-attribution"]')).toHaveLength(1);
      expect(el(fixture).querySelectorAll('[data-testid="map-attribution"] a')).toHaveLength(2);

      release();
      await loaded(fixture);
      expect(byTestId(fixture, 'sheet-poster')).toBeNull();
      expect(el(fixture).querySelectorAll('[data-testid="map-attribution"]')).toHaveLength(1);
    });

    it('a crowd press wakes the live map at the poster’s camera and replays the press', async () => {
      const fixture = await sheetPage();
      const still = himareStill();

      byTestId(fixture, 'map-place-pill')!.click();
      const handle = await loaded(fixture);

      expect(engine.created[0].options.view).toEqual(still.liveView(PHONE));
      // The crowd's separation zoom, centred between Palasë and Dhërmi.
      const view = handle.view();
      expect(view.zoom).toBeGreaterThan(still.view().zoom + 1);
      expect(view.center.lng).toBeCloseTo((19.607 + 19.6401) / 2, 3);
      expect(view.center.lat).toBeCloseTo((40.175 + 40.1573) / 2, 3);
      expect(byTestId(fixture, 'sheet-poster')).toBeNull();
    });

    it('the sheet pulled below half wakes the live map and fits the window it leaves', async () => {
      const fixture = await sheetPage();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const scroller = byTestId(fixture, 'sheet-scroller')!;
      const tops = sheet(fixture).tops();
      expect(engine.created).toHaveLength(0);

      // A finger's first pixels down from half: the live map is asked for, the camera stays.
      scroller.scrollTop = tops.peek - tops.half - 30;
      scroller.dispatchEvent(new Event('scroll'));
      const handle = await loaded(fixture);
      expect(handle.view()).toEqual(himareStill().liveView(PHONE));

      // At peek the fit aims at the taller window: two pins 0.034° apart fill it at ~12.7.
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll'));
      await settle(fixture);
      expect(sheet(fixture).detent()).toBe('peek');
      expect(handle.view().zoom).toBeGreaterThan(12);
    });

    it('a tap on the ground clears the lit row', async () => {
      const fixture = await sheetPage();
      // Narrowed to Dhërmi, Aurora Bay's pin stands alone, so its press lights its row.
      byTestId(fixture, 'head-beaches')!.click();
      await settle(fixture);
      [
        ...el(fixture).querySelectorAll<HTMLButtonElement>(
          '[role="group"][aria-label="Beach"] button',
        ),
      ]
        .find((chip) => text(chip).startsWith('Dhërmi'))!
        .click();
      await settle(fixture);
      expect(byTestId(fixture, 'poster-image')?.getAttribute('src')).toBe(
        '/posters/beach-DHERMI-440@2x.jpg',
      );
      el(fixture).querySelector<HTMLButtonElement>('[data-pin="2"]')!.click();
      await settle(fixture);
      expect(el(fixture).querySelector('[data-selected]')).not.toBeNull();
      expect(engine.created).toHaveLength(0);

      byTestId(fixture, 'sheet-poster')!.click();
      await settle(fixture);

      expect(el(fixture).querySelector('[data-selected]')).toBeNull();
    });

    it('above the widest bucket the live map is the ground from the first paint', async () => {
      useViewport({ width: 900, height: 1100 });
      const fixture = await sheetPage();

      expect(byTestId(fixture, 'sheet-poster')).toBeNull();
      expect(engine.created).toHaveLength(1);
      expect(byTestId(fixture, 'riviera-map-fake')).not.toBeNull();
    });

    it('located at Tirana keeps the Durrës poster and draws the dot on it', async () => {
      const fixture = await sheetPage();

      await locateAt(fixture, { kind: 'located', at: TIRANA });

      expect(engine.created).toHaveLength(0);
      expect(text(byTestId(fixture, 'head-title'))).toBe('Durrës');
      const image = byTestId(fixture, 'poster-image') as HTMLImageElement;
      expect(image.getAttribute('src')).toBe('/posters/DURRES-440@2x.jpg');
      const poster = posterFor('DURRES', '', PHONE)!;
      const still = new PosterHandle(
        poster.camera,
        PHONE.width,
        poster.bucket.height,
        () => undefined,
      );
      const dot = byTestId(fixture, 'here-dot')!;
      const at = still.project(TIRANA);
      expect(Number.parseFloat(dot.style.left)).toBeCloseTo(at.x, 3);
      expect(Number.parseFloat(dot.style.top)).toBeCloseTo(at.y, 3);
    });

    it('located off the poster opens the live map at the fit that holds the dot', async () => {
      const fixture = await sheetPage();
      // Shkodër town: inside the fence, nearest to Durrës's venues, 70 km north of its poster's window.
      const SHKODER_TOWN = { lng: 19.51, lat: 42.07 };

      await locateAt(fixture, { kind: 'located', at: SHKODER_TOWN });
      const handle = await loaded(fixture);

      expect(text(byTestId(fixture, 'head-title'))).toBe('Durrës');
      expect(byTestId(fixture, 'sheet-poster')).toBeNull();
      expect(byTestId(fixture, 'here-dot')).not.toBeNull();
      expect(handle.view().zoom).toBeLessThan(posterFor('DURRES', '', PHONE)!.camera.zoom);
      // The dot is in the window the fit aims at: the map between the header and the foot row.
      const at = handle.project(SHKODER_TOWN);
      const { header } = sheet(fixture).chrome();
      expect(at.y).toBeGreaterThanOrEqual(header);
      expect(at.y).toBeLessThanOrEqual(sheet(fixture).tops().half - 56);
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(PHONE.width);
      const dot = byTestId(fixture, 'here-dot')!;
      expect(Number.parseFloat(dot.style.left)).toBeCloseTo(at.x, 3);
      expect(Number.parseFloat(dot.style.top)).toBeCloseTo(at.y, 3);
    });
  });

  /**
   * The chrome's own geometry is the browser's, so what a jsdom spec can hold is the arithmetic
   * the page does with it: the window it confines the pills to, and the side its foot takes. The
   * boxes themselves, and the 0 intersections they buy, are measured in `discover-map.e2e.ts`.
   */
  describe('on a phone: the pills’ room', () => {
    it('hands the layer the map the header and the sheet leave', async () => {
      const fixture = await sheetPage();
      const { header, viewportW } = sheet(fixture).chrome();

      expect(layer(fixture).window()).toEqual({
        left: 0,
        top: header,
        right: viewportW,
        bottom: sheet(fixture).tops().half,
      });
    });

    it('leaves the layer its own box at full, where nothing re-fits', async () => {
      const fixture = await sheetPage();
      sheet(fixture).go('full');
      await settle(fixture);

      expect(sheet(fixture).detent()).toBe('full');
      expect(layer(fixture).window()).toBeNull();
    });

    it('moves the foot row for a lone pin under it, both pieces together', async () => {
      const fixture = await sheetPage();
      const [pin] = layer(fixture).loneBoxes();
      const { viewportW } = sheet(fixture).chrome();
      // The stubbed boxes MOVE with the side they are on; a fixed one would ask for an endless swap.
      const mirrored = (box: { left: number; right: number }): [number, number] => [
        viewportW - box.right,
        viewportW - box.left,
      ];
      lay(byTestId(fixture, 'sheet-near-me')!, (self) => {
        const [left, right] = self.classList.contains('left-3')
          ? mirrored(pin)
          : [pin.left, pin.right];
        return new DOMRect(left, pin.top, right - left, pin.bottom - pin.top);
      });
      lay(byTestId(fixture, 'map-attribution')!, () => new DOMRect(0, 0, 40, 10));

      window.dispatchEvent(new Event('resize'));
      await settle(fixture);

      expect(byTestId(fixture, 'sheet-near-me')!.classList.contains('left-3')).toBe(true);
      expect(byTestId(fixture, 'map-attribution')!.classList.contains('right-3')).toBe(true);
    });

    it('opens with the foot row unswapped: Near me right, the credit left', async () => {
      const fixture = await sheetPage();

      const nearMe = byTestId(fixture, 'sheet-near-me')!;
      expect(nearMe.classList.contains('right-3')).toBe(true);
      expect(nearMe.classList.contains('left-3')).toBe(false);
      expect(byTestId(fixture, 'map-attribution')!.classList.contains('left-3')).toBe(true);
    });
  });

  /**
   * The desktop panel: the sheet's own content, pinned open beside the map. The frame's pixels are
   * a browser fact (`discover-map.e2e.ts`); what a jsdom spec holds is the arithmetic and the two
   * rules that depend on how long the region is.
   */
  describe('from lg: the panel', () => {
    /** A Himarë long enough to outrun the panel, for the rule that turns on past fifteen. */
    function denseVenues(count: number): VenueSummary[] {
      const [miramar] = venues();
      return Array.from({ length: count }, (_unused, index) => ({
        ...miramar,
        id: 100 + index,
        name: `Himarë Venue ${index + 1}`,
        beach: index % 2 === 0 ? 'DHERMI' : 'JALE',
        region: 'HIMARE',
        location: { latitude: 40.15 + index / 1000, longitude: 19.64 },
      }));
    }

    async function panelPage(
      body: VenueSummary[] = sheetVenues(),
      width = 1440,
    ): Promise<ComponentFixture<Home>> {
      window.innerWidth = width;
      window.innerHeight = 900;
      const fixture = render({}, true);
      httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(body);
      await settle(fixture);
      return fixture;
    }

    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    afterEach(() => {
      window.innerWidth = originalSize.width;
      window.innerHeight = originalSize.height;
    });

    function heads(fixture: ComponentFixture<Home>): HTMLElement[] {
      return [...el(fixture).querySelectorAll<HTMLElement>('[data-testid="desk-group"]')];
    }

    it('clamps the panel to the row’s own width: 38 % of the window between 420 and 540', async () => {
      // The map takes what is left, which only a browser lays out (`discover-map.e2e.ts`).
      expect(byTestId(await panelPage(sheetVenues(), 1920), 'desk-panel')!.style.width).toBe(
        '540px',
      );
      expect(byTestId(await panelPage(sheetVenues(), 1300), 'desk-panel')!.style.width).toBe(
        '494px',
      );
      expect(byTestId(await panelPage(sheetVenues(), 1024), 'desk-panel')!.style.width).toBe(
        '420px',
      );
    });

    it('spells the beach chip out from a 480 px panel, and keeps the short form under it', async () => {
      expect(text(byTestId(await panelPage(sheetVenues(), 1440), 'head-beaches'))).toContain(
        'All beaches',
      );
      expect(text(byTestId(await panelPage(sheetVenues(), 1024), 'head-beaches'))).not.toContain(
        'All beaches',
      );
    });

    it('runs the beaches as heads with a rule and no count, while the region fits the panel', async () => {
      const fixture = await panelPage();

      expect(heads(fixture).length).toBeGreaterThan(0);
      for (const head of heads(fixture)) {
        expect(head.classList.contains('border-b')).toBe(true);
        expect(head.classList.contains('sticky')).toBe(false);
        expect(text(head)).not.toContain('venue');
      }
    });

    it('sticks the heads past fifteen venues, and only then gives them their counts', async () => {
      const fixture = await panelPage(denseVenues(16));

      expect(heads(fixture).length).toBeGreaterThan(0);
      for (const head of heads(fixture)) {
        expect(head.classList.contains('sticky')).toBe(true);
        expect(text(head)).toContain('venues');
      }
    });

    it('draws a row per venue and marks only the selected one current', async () => {
      const fixture = await panelPage();
      const rows = (): HTMLElement[] => [
        ...el(fixture).querySelectorAll<HTMLElement>('[data-testid="venue-row"]'),
      ];
      // Himarë's own: the two Palasë/Dhërmi venues the sheet fixture puts in the opening region.
      expect(rows().map((row) => row.getAttribute('aria-label')?.split(',')[0])).toEqual([
        'Palasa Sands',
        'Aurora Bay',
      ]);
      expect(rows().filter((row) => row.hasAttribute('aria-current'))).toEqual([]);

      byTestId(fixture, 'map-venue-pin')!.click();
      await settle(fixture);

      expect(rows().filter((row) => row.hasAttribute('aria-current'))).toHaveLength(1);
    });

    it('hands the layer the panel’s own Near me, which the map component does not draw', async () => {
      const fixture = await panelPage();
      const nearMe = byTestId(fixture, 'desk-near-me')!;
      lay(nearMe, () => new DOMRect(24, 700, 138, 44));
      window.dispatchEvent(new Event('resize'));
      await settle(fixture);

      expect(layer(fixture).noGo()).toContainEqual({
        left: 24,
        top: 700,
        right: 162,
        bottom: 744,
      });
    });

    it('leaves focus on the pressed pin: the row is the preview, so nothing is destroyed', async () => {
      const fixture = await panelPage();
      const pin = byTestId(fixture, 'map-venue-pin')!;
      pin.focus();

      pin.click();
      await settle(fixture);

      expect(document.activeElement).toBe(pin);
    });

    it('narrows to a pressed place in the head, client-side, exactly as the sheet does', async () => {
      // Two venues on ONE beach at one spot: a pressed place that names a beach to narrow to.
      const onDhermi = denseVenues(2).map((venue) => ({ ...venue, beach: 'DHERMI' as const }));
      const fixture = await panelPage(onDhermi);
      byTestId(fixture, 'map-place-pill')!.click();
      await settle(fixture);

      expect(text(byTestId(fixture, 'head-beaches'))).toContain('Dhërmi');
      // The panel draws no filter bar and no crumb, so a request here would have no way back.
      httpMock.expectNone((r) => r.url === `${environment.apiBaseUrl}/api/venues`);
    });

    it('closes the head’s rails on Escape, as the sheet does', async () => {
      const fixture = await panelPage();
      const rail = (): Element | null => el(fixture).querySelector('[aria-label="Beach"]');
      byTestId(fixture, 'head-beaches')!.click();
      await settle(fixture);
      expect(rail()).not.toBeNull();

      el(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle(fixture);

      expect(rail()).toBeNull();
    });

    it('lights a venue’s pin while the pointer is on its row, and only its own', async () => {
      const fixture = await panelPage();
      const rows = [...el(fixture).querySelectorAll<HTMLElement>('[data-testid="venue-row"]')];
      const lit = (): string[] =>
        [...el(fixture).querySelectorAll<HTMLElement>('[data-hover]')].map(
          (pin) => pin.dataset['pin'] ?? '',
        );
      expect(lit()).toEqual([]);

      rows[0].dispatchEvent(new MouseEvent('mouseenter'));
      await settle(fixture);
      expect(lit()).toHaveLength(1);

      rows[0].dispatchEvent(new MouseEvent('mouseleave'));
      await settle(fixture);
      expect(lit()).toEqual([]);
    });

    it('hangs the coast picker off the place button, which is the desktop’s only chooser', async () => {
      const fixture = await panelPage();
      expect(byTestId(fixture, 'coast-picker')).toBeNull();

      byTestId(fixture, 'head-place')!.click();
      await settle(fixture);

      const anchor = byTestId(fixture, 'head-place')!.parentElement!;
      expect(anchor.classList.contains('relative')).toBe(true);
      expect(anchor.querySelector('app-coast-picker')).not.toBeNull();
    });
  });
});
