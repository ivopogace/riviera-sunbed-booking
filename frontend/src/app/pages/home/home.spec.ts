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
import { FakeGeolocationGateway } from '../../../testing/fake-geolocation';
import { GeolocationGateway } from '../../shared/geolocation';
import { MapEngine } from '../../shared/map-engine';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { VenueSummary } from '../../shared/venue-views';
import { Home } from './home';

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
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sun 4 Jul 2027');
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
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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
    routeParams = new BehaviorSubject<ParamMap>(convertToParamMap({}));
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

    routeParams.next(convertToParamMap({ date: '2099-08-14' }));
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
    routeParams.next(convertToParamMap({ date: '2099-08-14' }));
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

    routeParams.next(convertToParamMap({ date: '2099-08-14' }));
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
