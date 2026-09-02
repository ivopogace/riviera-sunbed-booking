import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { environment } from '../../environments/environment';
import { VenueReviewsPage } from '../shared/venue-views';
import { VenueReviews } from './venue-reviews';

/**
 * Structural a11y (axe) audit of the venue page's review section in each of its states. Contrast
 * is proven deterministically in `venue-reviews.contrast.spec.ts`; the page-level composition is
 * audited by `venue-map.a11y.spec.ts` and the mocked e2e suite.
 */
describe('VenueReviews accessibility (axe)', () => {
  let fixture: ComponentFixture<VenueReviews>;
  let httpMock: HttpTestingController;

  const PAGE: VenueReviewsPage = {
    reviews: [
      { id: 41, stars: 4, displayName: 'Ana', stayedIn: '2026-07', comment: 'Great sunbeds.' },
      { id: 40, stars: 5, displayName: null, stayedIn: '2026-06', comment: 'Perfect.' },
    ],
    nextCursor: 40,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueReviews],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(VenueReviews);
    fixture.componentRef.setInput('venueId', 1);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function request() {
    return httpMock.expectOne(
      (req) => req.url === `${environment.apiBaseUrl}/api/venues/1/reviews`,
    );
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('the listed page with a "Show more" control has no violations', async () => {
    fixture.detectChanges();
    request().flush(PAGE);
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('the empty state has no violations', async () => {
    fixture.detectChanges();
    request().flush({ reviews: [], nextCursor: null });
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('the failure line with its retry has no violations', async () => {
    fixture.detectChanges();
    request().flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('the loading state has no violations', async () => {
    fixture.detectChanges();
    const pending = request();
    await expectNoAxeViolations(host());
    pending.flush({ reviews: [], nextCursor: null });
  });
});
