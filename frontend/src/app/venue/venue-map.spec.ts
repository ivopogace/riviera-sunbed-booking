import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { defaultBookingDate } from './booking-date';
import { SetView, VenueMapView } from './venue.model';
import { VenueMap } from './venue-map';

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
    sets,
  };
}

describe('VenueMap', () => {
  let fixture: ComponentFixture<VenueMap>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueMap],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueMap);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Match the venue request on path only (a `?date=` param is appended — issue #44). */
  function venueRequest(): TestRequest {
    return httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues/1`);
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

  it('renders prices from integer minor units (4500 → €45)', async () => {
    flushVenue();
    await fixture.whenStable();
    const firstTile = el().querySelector('[data-testid="set-tile"]');
    expect(firstTile?.textContent).toContain('€45');
  });

  it('gives each tile an accessible name carrying its state (not colour-only)', async () => {
    flushVenue();
    await fixture.whenStable();
    const firstTile = el().querySelector('[data-testid="set-tile"]');
    expect(firstTile?.getAttribute('aria-label')).toContain('Set Front row · Sea view 1');
    expect(firstTile?.getAttribute('aria-label')).toContain('taken');
  });

  it('exposes a booking button only for free online sets', async () => {
    flushVenue();
    await fixture.whenStable();
    // Free ONLINE sets are bookable buttons; taken and walk-in sets are not interactive.
    expect(el().querySelectorAll('.set-button').length).toBeGreaterThan(0);
    expect(el().querySelector('.set-tile.taken')?.querySelector('button')).toBeNull();
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

    const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
    input.value = '2026-07-15';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const req = venueRequest();
    expect(req.request.params.get('date')).toBe('2026-07-15');
    req.flush(miramar());
  });

  it('opens the booking dialog pre-set to the map’s selected date', async () => {
    flushVenue();
    await fixture.whenStable();

    const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
    input.value = '2026-07-20';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    venueRequest().flush(miramar()); // settle the re-fetch

    await fixture.whenStable();
    el().querySelector<HTMLButtonElement>('.set-button')!.click();
    await fixture.whenStable();

    const dialogDate = el().querySelector<HTMLInputElement>('app-booking-dialog input[type="date"]');
    expect(dialogDate?.value).toBe('2026-07-20');
  });
});
