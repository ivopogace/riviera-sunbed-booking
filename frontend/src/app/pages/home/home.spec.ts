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
import { whenSheetOpened } from '../../../testing/sheet-opened';
import { defaultBookingDate } from '../../shared/booking-date';
import { FakeMapEngine, FakeMapHandle } from '../../shared/fake-map-engine';
import { PosterHandle } from '../../shared/poster-handle';
import { FakeGeolocationGateway } from '../../../testing/fake-geolocation';
import { GeolocationGateway } from '../../shared/geolocation';
import { MapEngine, MapEngineOptions } from '../../shared/map-engine';
import { RivieraMap } from '../../shared/riviera-map';
import { VenueSummary } from '../../shared/venue-views';
import { DiscoverSheet } from './discover-sheet';
import { Home } from './home';
import { posterFor } from './map-poster';
import { VenuePinLayer } from './venue-pin-layer';

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
  /**
   * The two venues in one region. The sheet renders the region it opens on and never the whole
   * coast, so a list spread across regions would draw one card where the case wants two.
   */
  function listed(): VenueSummary[] {
    const [miramar, aurora] = venues();
    return [{ ...miramar, beach: 'PALASE', region: 'HIMARE' }, aurora];
  }

  let fixture: ComponentFixture<Home>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeOf({}) },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
        // The sheet's map is the ground, so it stands on the first paint rather than on demand.
        { provide: MapEngine, useValue: new FakeMapEngine() },
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
    req.flush(listed());
  });

  it('renders the cover photo on a card that has one and the gradient fallback on one that does not (#142)', async () => {
    const [withCover, noPhoto] = listed();
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
    const [closed, open] = listed();
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
    const [first, second] = listed();
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
    const [first] = listed();
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
    listRequest().flush(listed());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('.sales-closed-chip')).toBeNull();
  });

  it("passes the Discover grid's own sizes to the slideshow, not the 100vw default", async () => {
    const [venue] = listed();
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
    const [venue] = listed();
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
    listRequest().flush(listed());
    await fixture.whenStable();

    const cards = el().querySelectorAll('[data-testid="venue-card"]');
    expect(cards.length).toBe(2);

    const first = cards[0];
    expect(first.textContent).toContain('Miramar Beach Club');
    expect(first.textContent).toContain('Palasë · Himarë');
    expect(first.textContent).toContain('4.8'); // rating tenths → display
    expect(first.textContent).toContain('€25'); // fromPrice 2500 minor units
    expect(first.querySelector('[data-testid="card-availability"]')?.textContent).toContain(
      '18 of 24',
    );
  });

  it('renders a "New" state (no ★ 0.0 / "0 reviews") for an unrated venue (#154)', async () => {
    const [rated] = listed();
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
    const [rated] = listed();
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
    listRequest().flush(listed());
    await fixture.whenStable();
    const link = el().querySelector('[data-testid="venue-card"]');
    // The chosen date rides along as ?date= so it persists into the map (default = today, Tirane).
    expect(link?.getAttribute('href')).toBe(`/venues/1?date=${defaultBookingDate(new Date())}`);
  });

  it('updates the venue link’s date when the discovery date changes (#294)', async () => {
    listRequest().flush(listed());
    await fixture.whenStable();

    // The rail's last day: within the seven it offers, and never today.
    el().querySelector<HTMLButtonElement>('[data-testid="head-day"]')!.click();
    await fixture.whenStable();
    const days = [...el().querySelectorAll<HTMLButtonElement>('[aria-label="Day"] button')];
    const future = defaultBookingDate(
      new Date(Date.now() + (days.length - 1) * 24 * 60 * 60 * 1000),
    );
    days[days.length - 1].click();
    await fixture.whenStable();
    listRequest().flush(listed()); // settle the date-change reload
    await fixture.whenStable();

    const href = el().querySelector('[data-testid="venue-card"]')?.getAttribute('href');
    expect(href).toBe(`/venues/1?date=${future}`);
  });

  it('gives each card a single accessible name carrying every fact (not layout-only)', async () => {
    listRequest().flush(listed());
    await fixture.whenStable();
    const label = el().querySelector('[data-testid="venue-card"]')?.getAttribute('aria-label');
    expect(label).toContain('Miramar Beach Club');
    expect(label).toContain('rated 4.8 out of 5');
    expect(label).toContain('18 of 24 sets free');
    expect(label).toContain('View beach map');
  });

  it('sizes the availability-bar fill as round(free/total*100)%', async () => {
    listRequest().flush(listed());
    await fixture.whenStable();

    const fills = el().querySelectorAll<HTMLElement>('.avail-fill');
    expect(fills.length).toBe(2);
    expect(fills[0].style.width).toBe('75%'); // 18 of 24
    expect(fills[1].style.width).toBe('50%'); // 5 of 10
  });

  it('renders a 0% availability bar for a venue with no sets (no division by zero)', async () => {
    const zeroSets: VenueSummary = {
      ...listed()[0],
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
    listRequest().flush(listed());
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
    const [rated] = listed();
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

    const outcome = el().querySelector('[data-testid="sheet-outcome"]')!;
    expect(outcome.getAttribute('aria-live')).toBe('polite');
    expect(outcome.textContent).toContain('0 of 0 selling today');
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

  it('recovers from an initial-load failure when Retry is pressed', async () => {
    listRequest().error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="error"]')).not.toBeNull();

    el().querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click();
    await fixture.whenStable();

    // Retry re-runs the failed request (the initial, unfiltered load) and recovers.
    listRequest().flush(listed());
    await fixture.whenStable();

    expect(el().querySelector('[data-testid="error"]')).toBeNull();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(2);
    // The head is re-seeded too: the beaches chip counts the region the recovered list holds.
    expect(el().querySelector('[data-testid="head-beaches"]')?.textContent).toContain('2');
  });

  it('moves keyboard focus to the head when Retry is pressed (WCAG 2.4.3)', async () => {
    listRequest().error(new ProgressEvent('error'));
    await fixture.whenStable();

    el().querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Retry tears down the panel holding the pressed button; the head outlives every list state.
    expect(document.activeElement).toBe(el().querySelector('[data-testid="head-place"]'));

    listRequest().flush(listed()); // settle for httpMock.verify()
  });

  it('renders no lead-time note — the rule lives on the venue surface now (#804)', async () => {
    listRequest().flush(listed());
    await fixture.whenStable();

    expect(el().querySelector('[data-testid="cutoff-note"]')).toBeNull();
    expect(el().querySelector('[data-testid="sales-close-note"]')).toBeNull();
  });

  it('shows the loading state before the response arrives', async () => {
    const req = listRequest(); // pending
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="loading"]')).not.toBeNull();
    req.flush(listed()); // settle for httpMock.verify()
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

    req.flush(listed());
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="skeleton-card"]')).toBeNull();
  });

  it('announces through one region that survives loading → loaded (#741)', async () => {
    const req = listRequest(); // pending
    await fixture.whenStable();

    const announcer = el().querySelector('[data-testid="load-announcer"]')!;
    expect(announcer.textContent?.trim()).toBe('Loading venues…');

    req.flush(listed());
    await fixture.whenStable();

    // The SAME node, still mounted: that identity is what makes the change an announcement.
    expect(el().querySelector('[data-testid="load-announcer"]')).toBe(announcer);
    // Empty on purpose: the persistent results-count region already speaks the outcome.
    expect(announcer.textContent?.trim()).toBe('');
  });

  it('agrees the review noun with the count on the Discover card', async () => {
    // The twin of the venue-map header assertion — shared/rating.ts exists so these cannot drift.
    const [rated] = listed();
    listRequest().flush([{ ...rated, ratingTenths: 50, reviewsCount: 1 }]);
    await fixture.whenStable();

    const card = el().querySelector('[data-testid="venue-card"]')!;
    expect(card.textContent).toContain('1 review');
    expect(card.textContent).not.toContain('1 reviews');
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
    await whenSheetOpened(fixture);
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
   * The route's whole `map` contract, as a tourist's URL crosses it: no value selects a layout.
   * A bookmark carrying `?map=off` or `?map=sheet` from the flagged releases neither throws nor
   * changes the page — the width alone decides which arm renders.
   */
  it('with no query parameter the page is the riviera map sheet', async () => {
    const fixture = await sheetPage();

    expect(byTestId(fixture, 'sheet-scroller')).not.toBeNull();
    expect(byTestId(fixture, 'head-day')).not.toBeNull();
    expect(byTestId(fixture, 'filter-beach')).toBeNull();
    expect(byTestId(fixture, 'view-switch')).toBeNull();
  });

  for (const map of ['off', 'sheet']) {
    it(`?map=${map} is inert below lg: the sheet renders exactly as it does for /`, async () => {
      const fixture = render({ map });
      httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(venues());
      await settle(fixture);

      expect(byTestId(fixture, 'sheet-scroller')).not.toBeNull();
      expect(byTestId(fixture, 'head-day')).not.toBeNull();
      expect(byTestId(fixture, 'filter-beach')).toBeNull();
      expect(byTestId(fixture, 'view-switch')).toBeNull();
      expect(byTestId(fixture, 'venue-preview')).toBeNull();
    });

    it(`?map=${map} is inert from lg up: the pinned panel renders exactly as it does for /`, async () => {
      const fixture = render({ map }, true);
      httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(venues());
      await settle(fixture);

      expect(byTestId(fixture, 'desk-panel')).not.toBeNull();
      expect(byTestId(fixture, 'map-panel')).toBeNull();
      expect(byTestId(fixture, 'filter-beach')).toBeNull();
      expect(byTestId(fixture, 'view-switch')).toBeNull();
    });
  }

  it('the two arms are chosen by width alone: no flag, no list/map view signal', async () => {
    const narrow = await sheetPage();
    expect(byTestId(narrow, 'sheet-scroller')).not.toBeNull();
    expect(byTestId(narrow, 'desk-panel')).toBeNull();

    const wide = render({}, true);
    httpMock.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`).flush(venues());
    await settle(wide);
    expect(byTestId(wide, 'desk-panel')).not.toBeNull();
    expect(byTestId(wide, 'sheet-scroller')).toBeNull();

    // The signals the retired arm needed are gone from the component, not merely unrendered.
    const page = wide.componentInstance as unknown as Record<string, unknown>;
    for (const gone of ['view', 'listShown', 'mapOpen', 'mapFlag']) {
      expect(page[gone], `${gone} is still on Home`).toBeUndefined();
    }
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
