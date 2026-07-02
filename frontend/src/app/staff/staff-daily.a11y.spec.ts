import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { environment } from '../../environments/environment';
import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { SetView, VenueMapView } from '../venue/venue.model';
import { StaffDaily } from './staff-daily';

/**
 * Automated axe-core audit of the U8 staff daily view: sign-in, signed-in loaded view, loading and
 * error states. Guards the a11y the component implements (accessible tile names, ARIA validity,
 * non-colour tile state). Colour contrast is checked deterministically in
 * `staff-daily.contrast.spec.ts` — axe can't measure contrast under jsdom.
 */
const BASE = environment.apiBaseUrl;
const VENUE = 1;

function fixtureMap(): VenueMapView {
  const sets: SetView[] = [
    { id: 1, rowLabel: 'Front row', positionNo: 1, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 1, gridY: 1, availability: 'FREE' },
    { id: 2, rowLabel: 'Front row', positionNo: 2, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 2, gridY: 1, availability: 'TAKEN' },
    { id: 3, rowLabel: 'Row 2', positionNo: 1, tier: 'STANDARD', pool: 'WALK_IN', price: { minorUnits: 2500, currency: 'EUR' }, gridX: 1, gridY: 2, availability: 'TAKEN' },
  ];
  return {
    id: VENUE, name: 'Miramar Beach Club', beach: 'Ksamil', region: 'Albanian Riviera',
    description: 'Loungers on the shore.', ratingTenths: 48, reviewsCount: 12,
    bookingMode: 'INSTANT', fromPrice: { minorUnits: 2500, currency: 'EUR' }, sets,
  };
}

describe('StaffDaily accessibility (axe)', () => {
  let fixture: ComponentFixture<StaffDaily>;
  let httpMock: HttpTestingController;
  let operator: OperatorAuth;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StaffDaily],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ venueId: String(VENUE) }) } },
        },
      ],
    });
    operator = TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function expectMap() {
    return httpMock.expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}` && r.method === 'GET');
  }
  function expectBookings() {
    return httpMock.expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/bookings` && r.method === 'GET');
  }
  function expectRequests() {
    return httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/${VENUE}/booking-requests` && r.method === 'GET',
    );
  }

  it('has no violations on the sign-in form', async () => {
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations when the daily view is loaded', async () => {
    operator.signIn('operator', 'pw');
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable();
    expectMap().flush(fixtureMap());
    expectBookings().flush([{ setId: 2, code: 'ONLINE0001' }]);
    expectRequests().flush([]);
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations with a populated pending-requests queue (#98)', async () => {
    operator.signIn('operator', 'pw');
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable();
    expectMap().flush(fixtureMap());
    expectBookings().flush([{ setId: 2, code: 'ONLINE0001' }]);
    expectRequests().flush([
      {
        bookingId: 11,
        setId: 1,
        bookingDate: '2026-07-03',
        guestName: 'Ana Guest',
        amount: { minorUnits: 4500, currency: 'EUR' },
        requestedAt: '2026-07-01T09:00:00Z',
        requestExpiresAt: '2026-07-02T16:00:00Z',
      },
    ]);
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations in the loading state', async () => {
    operator.signIn('operator', 'pw');
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable();
    const map = expectMap(); // pending → loading message
    const bookings = expectBookings();
    const requests = expectRequests();
    await expectNoAxeViolations(host());
    map.flush(fixtureMap()); // settle so verify() is clean
    bookings.flush([]);
    requests.flush([]);
  });

  it('has no violations in the error state', async () => {
    operator.signIn('operator', 'pw');
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable();
    expectMap().error(new ProgressEvent('error'));
    expectBookings().flush([]);
    expectRequests().flush([]);
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });
});
