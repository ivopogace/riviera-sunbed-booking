import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { VenueProfileView } from './operator-console.model';
import { VenueTab } from './venue-tab';

/**
 * Structural a11y audit for the O8 Venue & commodities tab (#177). Every field is a labelled control;
 * the amenity chips are `aria-pressed` toggle buttons with text; commission + payout currency are
 * read-only `<output>`s; the photo slots (#142) are labelled buttons with an `alt`-texted preview
 * image. axe runs over the loaded form and the load-error state. (Colour contrast is proven by
 * `venue-tab.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('VenueTab a11y (#177)', () => {
  let fixture: ComponentFixture<VenueTab>;
  let http: HttpTestingController;

  const PROFILE: VenueProfileView = {
    name: 'Miramar',
    beach: 'Ksamil',
    region: 'Riviera',
    description: 'lovely',
    bookingMode: 'INSTANT',
    bookingCutoff: '18:00',
    commissionBps: 1500,
    payoutCurrency: 'EUR',
    amenities: ['WIFI', 'BEACH_BAR'],
    distanceToWaterM: 20,
    version: 7,
    photos: {
      cover: { present: true, previewUrl: '/api/venues/1/photos/cc03' },
      sunbeds: { present: false, previewUrl: null },
      bar: { present: false, previewUrl: null },
    },
  };

  function configure(): void {
    TestBed.configureTestingModule({
      imports: [VenueTab],
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
    fixture = TestBed.createComponent(VenueTab);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
  }

  afterEach(() => http.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('has no axe violations with a loaded profile', async () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/profile'))
      .flush(PROFILE);
    fixture.detectChanges();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations in the load-error state', async () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/profile'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with the stale-write conflict banner shown (#224)', async () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/profile'))
      .flush(PROFILE);
    fixture.detectChanges();

    // Reveal the conflict banner by failing a save with a 409 STALE_WRITE.
    host().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'PATCH')
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    await expectNoAxeViolations(host());
  });
});
