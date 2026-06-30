import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { expectNoAxeViolations } from '../../../testing/axe';
import { VenueSummary } from '../../venue/venue.model';
import { Home } from './home';

/**
 * Automated axe-core structural audit of the venue-discovery landing page (issue #61; a11y gate
 * from #38). Guards the accessible card names, ARIA validity, and the distinct loading/empty/error
 * states. Colour contrast is checked deterministically in `home.contrast.spec.ts` (axe can't
 * measure contrast under jsdom) and in the real-browser e2e.
 */
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

describe('Home accessibility (axe)', () => {
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

  function listRequest(): TestRequest {
    return httpMock.expectOne((req) => req.url === `${environment.apiBaseUrl}/api/venues`);
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('has no critical/serious violations when venues are listed', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations in the loading state', async () => {
    const req = listRequest(); // pending → loading message
    await fixture.whenStable();
    await expectNoAxeViolations(host());
    req.flush(venues());
  });

  it('has no violations in the empty state', async () => {
    listRequest().flush([]);
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations in the error state', async () => {
    listRequest().error(new ProgressEvent('error'));
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });
});
