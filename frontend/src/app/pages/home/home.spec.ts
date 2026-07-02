import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { defaultBookingDate } from '../../venue/booking-date';
import { VenueSummary } from '../../venue/venue.model';
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

  it('links each card to the venue beach map', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    const link = el().querySelector('[data-testid="venue-card"]');
    expect(link?.getAttribute('href')).toBe('/venues/1');
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

    const input = el().querySelector<HTMLInputElement>('[data-testid="filter-date"]')!;
    input.value = '2026-07-15';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const req = listRequest();
    expect(req.request.params.get('date')).toBe('2026-07-15');
    req.flush(venues());
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

  it('leaves the amenity chip slot empty until T7 (#140) supplies data', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();

    const slot = el().querySelector('[data-testid="card-chips"]');
    expect(slot).not.toBeNull();
    expect(slot?.textContent?.trim()).toBe('');
  });

  it('shows a distinct empty state when no venues match', async () => {
    listRequest().flush([]);
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="empty"]')).not.toBeNull();
    expect(el().querySelectorAll('[data-testid="venue-card"]').length).toBe(0);
  });

  it('shows an accessible error state when the request fails', async () => {
    listRequest().error(new ProgressEvent('error'));
    await fixture.whenStable();
    const error = el().querySelector('[data-testid="error"]');
    expect(error).not.toBeNull();
    expect(error?.getAttribute('role')).toBe('alert');
  });

  it('shows the loading state before the response arrives', async () => {
    const req = listRequest(); // pending
    await fixture.whenStable();
    expect(el().querySelector('[data-testid="loading"]')).not.toBeNull();
    req.flush(venues()); // settle for httpMock.verify()
  });
});
