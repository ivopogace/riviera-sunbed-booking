import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { environment } from '../../environments/environment';
import { expectNoAxeViolations } from '../../testing/axe';
import { SetView, VenueMapView } from './venue.model';
import { VenueMap } from './venue-map';

/**
 * Automated axe-core structural audit of the beach map (issue #38, AC-1/AC-2). Guards the
 * a11y the U1 component implements (accessible tile names, ARIA validity, non-colour
 * state) against regression. Colour contrast is checked separately and deterministically
 * in `venue-map.contrast.spec.ts` — axe can't measure contrast under jsdom.
 */

/** A small but representative map: a premium front row with a taken tile + a standard row. */
function fixture(): VenueMapView {
  const rows: readonly {
    label: string;
    tier: SetView['tier'];
    pool: SetView['pool'];
    price: number;
    gridY: number;
    taken: readonly boolean[];
  }[] = [
    { label: 'Front row · Sea view', tier: 'PREMIUM', pool: 'ONLINE', price: 4500, gridY: 1, taken: [true, false, false] },
    { label: 'Row 2', tier: 'STANDARD', pool: 'WALK_IN', price: 2500, gridY: 2, taken: [false, false, false] },
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

describe('VenueMap accessibility (axe)', () => {
  let fixtureRef: ComponentFixture<VenueMap>;
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

    fixtureRef = TestBed.createComponent(VenueMap);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function expectVenueRequest() {
    // The map appends a `?date=` param (issue #44); match on the path, ignoring the query.
    return httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues/1`);
  }

  function host(): HTMLElement {
    return fixtureRef.nativeElement as HTMLElement;
  }

  it('has no critical/serious violations when the map is loaded', async () => {
    expectVenueRequest().flush(fixture());
    await fixtureRef.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations in the loading state', async () => {
    const req = expectVenueRequest(); // pending → component shows the loading message
    await fixtureRef.whenStable();
    await expectNoAxeViolations(host());
    req.flush(fixture()); // settle the request so httpMock.verify() is clean
  });

  it('has no violations in the error state', async () => {
    expectVenueRequest().error(new ProgressEvent('error'));
    await fixtureRef.whenStable();
    await expectNoAxeViolations(host());
  });
});
