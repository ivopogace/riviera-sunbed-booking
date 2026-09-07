import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { environment } from '../../environments/environment';
import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { VenueMapView } from '../shared/venue-views';
import { OperatorConsole } from './operator-console';

/**
 * Automated axe-core audit of the operator console shell: the signed-in porcelain shell
 * (header with the venue switcher and the account chip + tab rail + Requests badge). Sign-in lives behind `operatorSessionGuard`, not in this
 * shell. Colour contrast is proven deterministically in `operator-console.contrast.spec.ts` — axe
 * cannot measure contrast under jsdom.
 */
const BASE = environment.apiBaseUrl;
const VENUE = 1;

function venueMap(): VenueMapView {
  return {
    id: VENUE,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: 'Loungers on the shore.',
    ratingTenths: 48,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: null,
    sets: [],
  };
}

describe('OperatorConsole accessibility (axe, #170)', () => {
  let fixture: ComponentFixture<OperatorConsole>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    TestBed.configureTestingModule({
      imports: [OperatorConsole],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ venueId: String(VENUE) }) },
            paramMap: of(convertToParamMap({ venueId: String(VENUE) })),
          },
        },
      ],
    });
    TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(`${BASE}/api/auth/me`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await Promise.resolve();
    await Promise.resolve();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function createSignedIn(pending: number, venues = 1): Promise<void> {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}` && r.method === 'GET')
      .flush(venueMap());
    httpMock
      .expectOne(
        (r) => r.url === `${BASE}/api/venues/${VENUE}/booking-requests` && r.method === 'GET',
      )
      .flush(Array.from({ length: pending }, (_, i) => ({ bookingId: i + 1 })));
    // The stats strip mounts in the shell and fires its three reads — audit WITH it.
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/bookings` && r.method === 'GET')
      .flush([]);
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/takings` && r.method === 'GET')
      .flush({
        gross: { minorUnits: 0, currency: 'EUR' },
        net: { minorUnits: 0, currency: 'EUR' },
        commissionBps: 1500,
        date: '2026-07-07',
      });
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/availability` && r.method === 'GET')
      .flush([]);
    // The venue switcher in the header reads the owned list.
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/mine` && r.method === 'GET')
      .flush(
        Array.from({ length: venues }, (_, i) => ({
          id: i + 1,
          name: i === 0 ? 'Miramar Beach Club' : `Venue ${i + 1}`,
          beach: 'Ksamil',
        })),
      );
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('has no violations on the signed-in shell (header + tabs)', async () => {
    await createSignedIn(0);
    await expectNoAxeViolations(host());
  });

  it('has no violations with a Requests badge showing', async () => {
    await createSignedIn(3);
    await expectNoAxeViolations(host());
  });

  it('has no violations with the venue switcher open for two owned venues (#1009)', async () => {
    await createSignedIn(0, 2);
    host().querySelector<HTMLButtonElement>('button[data-testid="oc-venue-title"]')!.click();
    fixture.detectChanges();
    expect(host().querySelector('[data-testid="oc-venue-menu"]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });
});
