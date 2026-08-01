import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { SetView } from '../shared/venue-views';
import { PricingTab } from './pricing-tab';

/**
 * Structural a11y audit for the O4 Pricing tab (#174). Each row's € field is a labelled number
 * `<input>` (`aria-label` names the row), so the grid of prices is keyboard + AT operable. axe runs
 * over the populated rows and the empty state. (Colour contrast is proven by
 * `pricing-tab.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('PricingTab a11y (#174)', () => {
  let fixture: ComponentFixture<PricingTab>;
  let http: HttpTestingController;

  function render(sets: SetView[]): void {
    TestBed.configureTestingModule({
      imports: [PricingTab],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({}) },
            parent: { snapshot: { paramMap: convertToParamMap({ venueId: '1' }) } },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(PricingTab);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets });
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('has no axe violations with priced rows', async () => {
    render([
      seat(1, 'A', 'PREMIUM', 'ONLINE', 1, 1),
      seat(2, 'A', 'PREMIUM', 'WALK_IN', 2, 1),
      seat(3, 'B', 'STANDARD', 'ONLINE', 1, 2),
    ]);
    await expectNoAxeViolations(host());
  });

  it('has no axe violations in the empty state', async () => {
    render([]);
    await expectNoAxeViolations(host());
  });
});

function seat(
  id: number,
  rowLabel: string,
  tier: 'PREMIUM' | 'STANDARD',
  pool: 'ONLINE' | 'WALK_IN',
  gridX: number,
  gridY: number,
): SetView {
  return {
    id,
    rowLabel,
    positionNo: gridX,
    tier,
    pool,
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX,
    gridY,
    availability: 'FREE',
  };
}
