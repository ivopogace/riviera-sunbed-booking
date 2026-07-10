import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { Pool, SetView, Tier } from '../venue/venue.model';
import { DailyViewTab } from './daily-view-tab';

/**
 * Structural a11y audit for the O5 Daily view tab (#175). Each actionable tile is a labelled
 * `<button>` (`aria-label` names row, position, tier, price and the tap action) and each locked tile
 * a labelled `<span>`, so tile STATE is conveyed by an accessible name, not colour alone. axe runs
 * over the populated grid + arrivals and the empty arrivals state. (Contrast is proven by
 * `daily-view-tab.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('DailyViewTab a11y (#175)', () => {
  let fixture: ComponentFixture<DailyViewTab>;
  let http: HttpTestingController;

  function render(sets: SetView[], bookings: { setId: number; code: string }[]): void {
    TestBed.configureTestingModule({
      imports: [DailyViewTab],
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
    fixture = TestBed.createComponent(DailyViewTab);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings')).flush(bookings);
    http
      .expectOne(
        (r) => r.method === 'GET' && r.url.includes('/api/venues/1') && !r.url.includes('/bookings'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets });
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('has no axe violations with a populated grid + arrivals', async () => {
    render(
      [
        seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'FREE'),
        seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 'TAKEN'),
        seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'TAKEN'),
      ],
      [{ setId: 2, code: 'ABC12345' }],
    );
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with an empty arrivals list', async () => {
    render([seat(1, 'A', 1, 'STANDARD', 'WALK_IN', 'FREE')], []);
    await expectNoAxeViolations(host());
  });
});

function seat(
  id: number,
  rowLabel: string,
  positionNo: number,
  tier: Tier,
  pool: Pool,
  availability: 'FREE' | 'TAKEN',
): SetView {
  return {
    id,
    rowLabel,
    positionNo,
    tier,
    pool,
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability,
  };
}
