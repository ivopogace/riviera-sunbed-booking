import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { defaultBookingDate } from '../../shared/booking-date';
import { VenueSummary } from '../../shared/venue-views';
import { Home } from './home';

/** Two venues across two beaches/regions, mirroring the discovery summary shape. */
function venues(): VenueSummary[] {
  return [
    {
      id: 1,
      name: 'Miramar Beach Club',
      beach: 'Ksamil',
      region: 'Albanian Riviera',
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
      beach: 'Dhërmi',
      region: 'Albanian Riviera',
      ratingTenths: 41,
      reviewsCount: 88,
      bookingMode: 'REQUEST',
      fromPrice: { minorUnits: 3000, currency: 'EUR' },
      availability: { free: 5, total: 10 },
    },
  ];
}

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

  it('requests the venue list for tomorrow in Europe/Tirane by default', () => {
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
      { ...withCover, coverPhoto: { card: '/api/venues/1/photos/aa01', banner: '/api/venues/1/photos/bb02' } },
      noPhoto,
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = el().querySelectorAll('[data-testid="venue-card"]');
    const coverImg = cards[0].querySelector<HTMLImageElement>('[data-testid="card-photo-img"]');
    // The service resolves the wire's root-relative path against the API origin.
    expect(coverImg?.getAttribute('src')).toBe(`${environment.apiBaseUrl}/api/venues/1/photos/aa01`);
    // The scrim stays layered over the photo — the location text's AA floor depends on it.
    expect(cards[0].querySelector('.photo-scrim')).toBeTruthy();
    expect(cards[0].querySelector('.photo-sun')).toBeNull();
    // No cover → the gradient placeholder (sun, no img).
    expect(cards[1].querySelector('[data-testid="card-photo-img"]')).toBeNull();
    expect(cards[1].querySelector('.photo-sun')).toBeTruthy();
  });

  it('renders a card per venue with name, location, rating, from-price and availability', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const cards = el().querySelectorAll('[data-testid="venue-card"]');
    expect(cards.length).toBe(2);

    const first = cards[0];
    expect(first.textContent).toContain('Miramar Beach Club');
    expect(first.textContent).toContain('Ksamil · Albanian Riviera');
    expect(first.textContent).toContain('4.8'); // rating tenths → display
    expect(first.textContent).toContain('€25'); // fromPrice 2500 minor units
    expect(first.querySelector('[data-testid="card-availability"]')?.textContent).toContain('18 of 24');
  });

  it('renders a "New" state (no ★ 0.0 / "0 reviews") for an unrated venue (#154)', async () => {
    const [rated] = venues();
    const unrated: VenueSummary = { ...rated, id: 2, name: 'Miramare', ratingTenths: 0, reviewsCount: 0 };
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
    const unrated: VenueSummary = { ...rated, id: 2, name: 'Miramare', ratingTenths: 0, reviewsCount: 0 };
    listRequest().flush([unrated]);
    await fixture.whenStable();

    const label = el().querySelector('[data-testid="venue-card"]')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('no reviews yet');
    expect(label).not.toContain('rated 0.0 out of 5');
  });

  it('links each card to the venue beach map, carrying the selected date (#294)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    const link = el().querySelector('[data-testid="venue-card"]');
    // The chosen date rides along as ?date= so it persists into the map (default = tomorrow, Tirane).
    expect(link?.getAttribute('href')).toBe(`/venues/1?date=${defaultBookingDate(new Date())}`);
  });

  it('updates the venue link’s date when the discovery date changes (#294)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    // A date guaranteed to differ from the default (tomorrow) on any calendar day (the 2026-07-14 flake).
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
    expect(beachOptions).toEqual(['All beaches', 'Dhërmi', 'Ksamil']); // sorted, with the "all" default
  });

  it('re-queries with the chosen beach filter (sending the beach param)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const select = el().querySelector<HTMLSelectElement>('[data-testid="filter-beach"]')!;
    select.value = 'Dhërmi';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const req = listRequest();
    expect(req.request.params.get('beach')).toBe('Dhërmi');
    req.flush([venues()[1]]);
    await fixture.whenStable();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(1);
  });

  it('re-queries when the date changes', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    // A date guaranteed to differ from the component's default (tomorrow) on ANY calendar day —
    // a hardcoded date that happens to equal "tomorrow" fires no change event (the 2026-07-14
    // flake). Derived like the component derives its own default, a week out.
    const chosen = defaultBookingDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const input = el().querySelector<HTMLInputElement>('[data-testid="filter-date"]')!;
    input.value = chosen;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const req = listRequest();
    expect(req.request.params.get('date')).toBe(chosen);
    req.flush(venues());
  });

  it('floors the date picker at tomorrow in Europe/Tirane (no past/today via the native picker) (#155)', async () => {
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
    const chipTexts = [...firstChips.querySelectorAll('.amenity-chip')].map((c) => c.textContent?.trim());
    expect(chipTexts).toEqual(['15m to water', 'Beach bar', 'Free parking', 'Showers']);

    // The card content is aria-hidden, so the chip text must also reach AT via the accessible name.
    const label = cards[0].getAttribute('aria-label') ?? '';
    expect(label).toContain('15m to water');
    expect(label).toContain('Amenities: Beach bar, Free parking, Showers');

    // Venue 2 states no amenities/distance → its slot renders nothing (collapses).
    const secondChips = cards[1].querySelector('[data-testid="card-chips"]');
    expect(secondChips?.textContent?.trim()).toBe('');
  });

  it('shows a distinct empty state when no venues match', async () => {
    listRequest().flush([]);
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="empty"]')).not.toBeNull();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(0);
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

  it('retries the filtered request (not the initial load) when a filter-change fetch failed', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const select = el().querySelector<HTMLSelectElement>('[data-testid="filter-beach"]')!;
    select.value = 'Dhërmi';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    listRequest().error(new ProgressEvent('error')); // the filtered reload fails
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="error"]')).not.toBeNull();

    el().querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click();
    await fixture.whenStable();

    // The retry carries the active beach filter — it re-ran reload(), not the unfiltered loadInitial().
    const req = listRequest();
    expect(req.request.params.get('beach')).toBe('Dhërmi');
    req.flush([venues()[1]]);
    await fixture.whenStable();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(1);
  });

  it('renders the cutoff explainer line under the filter bar (display-only, invariant #4)', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const note = el().querySelector('[data-testid="cutoff-note"]');
    expect(note).not.toBeNull();
    // \s matches the non-breaking space in "6 PM", so the copy reads plainly here.
    const text = note?.textContent ?? '';
    expect(text).toContain('Bookings close the evening before');
    expect(text).toMatch(/book by 6\s+PM the day before/);
  });

  it('shows the loading state before the response arrives', async () => {
    const req = listRequest(); // pending
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="loading"]')).not.toBeNull();
    req.flush(venues()); // settle for httpMock.verify()
  });
});
