import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { environment } from '../../environments/environment';
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
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueMap);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flushVenue(): void {
    httpMock.expectOne(`${environment.apiBaseUrl}/api/venues/1`).flush(miramar());
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
});
