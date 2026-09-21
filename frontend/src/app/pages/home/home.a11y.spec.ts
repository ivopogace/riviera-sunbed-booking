import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { expectNoAxeViolations } from '../../../testing/axe';
import { FakeMapEngine } from '../../shared/fake-map-engine';
import { FakeGeolocationGateway } from '../../../testing/fake-geolocation';
import { GeolocationGateway } from '../../shared/geolocation';
import { MapEngine } from '../../shared/map-engine';
import { RivieraMap } from '../../shared/riviera-map';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map-options';
import { VenueSummary } from '../../shared/venue-views';
import { Home } from './home';

/**
 * Automated axe-core structural audit of the venue-discovery landing page. Guards the accessible
 * card names, ARIA validity, and the distinct loading/empty/error states. Colour contrast is
 * checked deterministically in `home.contrast.spec.ts` (axe can't measure contrast under jsdom)
 * and in the real-browser e2e.
 */
function venues(): VenueSummary[] {
  return [
    {
      id: 1,
      name: 'Miramar Beach Club',
      beach: 'KSAMIL',
      region: 'SARANDE',
      ratingTenths: 48,
      reviewsCount: 326,
      bookingMode: 'INSTANT',
      fromPrice: { minorUnits: 2500, currency: 'EUR' },
      availability: { free: 18, total: 24 },
    },
    {
      id: 2,
      name: 'Aurora Bay',
      beach: 'DHERMI',
      region: 'HIMARE',
      ratingTenths: 41,
      reviewsCount: 88,
      bookingMode: 'REQUEST',
      fromPrice: { minorUnits: 3000, currency: 'EUR' },
      availability: { free: 5, total: 10 },
    },
  ];
}

/** The same two venues, each carrying a riviera-map pin. */
function pinnedVenues(): VenueSummary[] {
  const [miramar, aurora] = venues();
  return [
    { ...miramar, location: { latitude: 39.7712, longitude: 20.0021 } },
    { ...aurora, location: { latitude: 40.1573, longitude: 19.6401 } },
  ];
}

describe('Home accessibility (axe)', () => {
  let fixture: ComponentFixture<Home>;
  let httpMock: HttpTestingController;
  /**
   * The pre-Q Discover page — the hero, the three selects, the List/Map switch, the preview card.
   * `?map=off` is the one way to it now, and both the parameter and the page are a one-release
   * fallback; the riviera map's own audit is the describe below.
   */
  const preQParams = new BehaviorSubject<ParamMap>(convertToParamMap({ map: 'off' }));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // `/` is the riviera map; this block audits the pre-Q page, so it asks for it by name.
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: preQParams,
            snapshot: { queryParamMap: preQParams.value },
          },
        },
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
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

  async function openMap(list: VenueSummary[] = venues()): Promise<void> {
    fixture.detectChanges();
    listRequest().flush(list);
    fixture.detectChanges();
    await fixture.whenStable();

    host().querySelector<HTMLButtonElement>('[data-testid="view-map"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('has no violations with a venue closed for the season badged and sorted last', async () => {
    fixture.detectChanges();
    const [open, closed] = venues();
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush([
        { ...open, salesOpen: true },
        { ...closed, salesOpen: false, closedForSeason: true, reopensOn: '2027-05-15' },
      ]);
    await fixture.whenStable();
    fixture.detectChanges();
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no critical/serious violations when venues are listed', async () => {
    listRequest().flush(venues());
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations when a card carries the photo slideshow (labelled controls outside the link)', async () => {
    const [first, second] = venues();
    listRequest().flush([
      { ...first, photos: ['/api/venues/1/photos/aa01', '/api/venues/1/photos/cc03'] },
      second,
    ]);
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations when a venue is badged sales-closed for today', async () => {
    const [closed, open] = venues();
    listRequest().flush([
      { ...closed, salesOpen: false },
      { ...open, salesOpen: true },
    ]);
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

  it('has no violations with the map view open (switch pressed, map chrome rendered)', async () => {
    await openMap();

    expect(host().querySelector('app-riviera-map')).not.toBeNull();
    await expectNoAxeViolations(host());
  });

  it('has no violations with venue pins drawn on the map', async () => {
    await openMap(pinnedVenues());

    expect(host().querySelectorAll('[data-testid="map-venue-pin"]').length).toBe(2);
    await expectNoAxeViolations(host());
  });

  it('has no violations with a pin preview open over the map', async () => {
    await openMap(pinnedVenues());

    host().querySelector<HTMLButtonElement>('[data-testid="map-venue-pin"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[data-testid="venue-preview"]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });

  it('has no violations with a place pill, its members, and the crumb after a press', async () => {
    const [miramar, aurora] = pinnedVenues();
    const lori: VenueSummary = {
      ...miramar,
      id: 4,
      name: 'Lori Beach',
      location: { latitude: 39.77227, longitude: 20.00317 },
    };
    await openMap([miramar, lori, aurora]);
    expect(host().querySelectorAll('[data-testid="map-place-pill"]').length).toBe(1);
    expect(host().querySelectorAll('[data-testid="map-crowd-member"]').length).toBe(1);
    await expectNoAxeViolations(host());

    host().querySelector<HTMLButtonElement>('[data-testid="map-place-pill"]')!.click();
    fixture.detectChanges();
    listRequest().flush([miramar, lori]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[data-testid="map-beach-crumb"]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });

  it('has no violations with a closed-for-season venue previewed', async () => {
    const [pinned] = pinnedVenues();
    await openMap([
      { ...pinned, salesOpen: false, closedForSeason: true, reopensOn: '2027-05-15' },
    ]);

    host().querySelector<HTMLButtonElement>('[data-testid="map-venue-pin"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[data-testid="preview-closed"]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });

  it("has no violations with an inseparable crowd's preview and its stepper open over the map", async () => {
    const [, aurora] = pinnedVenues();
    const dhermi = [
      aurora,
      { ...aurora, id: 5, name: 'Folie Marine' },
      { ...aurora, id: 6, name: 'Dhërmi Sun Club' },
    ];
    await openMap(dhermi);
    const map = fixture.debugElement.query(By.directive(RivieraMap))
      .componentInstance as RivieraMap;
    map
      .handle()!
      .setView({ center: { lng: 19.6401, lat: 40.1573 }, zoom: RIVIERA_MAP_OPTIONS.maxZoom });
    fixture.detectChanges();

    host().querySelector<HTMLButtonElement>('[data-testid="map-place-pill"]')!.click();
    fixture.detectChanges();
    listRequest().flush(dhermi);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[data-testid="preview-stack-dots"]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });
});

/**
 * The riviera map sheet (what `/` renders, below `lg`): the head, the rails, the rows on the sheet,
 * the coast picker and the foot's Near me, each audited in the state the page reaches.
 */
describe('Home accessibility (the riviera map sheet — what `/` renders)', () => {
  let fixture: ComponentFixture<Home>;
  let httpMock: HttpTestingController;
  const originalMatchMedia = globalThis.matchMedia;
  const scrollable = Element.prototype as { scrollTo?: (options: ScrollToOptions) => void };
  const originalScrollTo = scrollable.scrollTo;

  beforeEach(async () => {
    globalThis.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
    scrollable.scrollTo = function scrollToStub(this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? 0;
      this.dispatchEvent(new Event('scroll'));
    };
    const params = new BehaviorSubject<ParamMap>(convertToParamMap({}));
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
        },
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Home);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
    scrollable.scrollTo = originalScrollTo;
    httpMock.verify();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  async function openSheet(): Promise<void> {
    fixture.detectChanges();
    const [miramar, aurora] = pinnedVenues();
    httpMock
      .expectOne((r) => r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush([miramar, { ...aurora, salesOpen: false }]);
    await settle();
  }

  it('has no violations at half with the head, the rows and the foot’s Near me', async () => {
    await openSheet();

    expect(host().querySelector('[data-testid="sheet-scroller"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="sheet-near-me"]')).not.toBeNull();
    expect(host().querySelectorAll('[data-testid="venue-card"]').length).toBe(1);
    await expectNoAxeViolations(host());
  });

  it('has no violations with the beach rail open and a row lit by its pin', async () => {
    await openSheet();
    host().querySelector<HTMLButtonElement>('[data-testid="head-beaches"]')!.click();
    host().querySelector<HTMLButtonElement>('[data-pin]')!.click();
    await settle();

    expect(host().querySelector('[role="group"][aria-label="Beach"]')).not.toBeNull();
    expect(host().querySelector('[data-selected]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });

  it('has no violations at full with the Map pill', async () => {
    await openSheet();
    host().querySelector<HTMLButtonElement>('[data-testid="sheet-grabber"]')!.click();
    await settle();

    expect(host().querySelector('[data-testid="sheet-map-pill"]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });

  it('has no violations with the coast picker open', async () => {
    await openSheet();
    host().querySelector<HTMLButtonElement>('[data-testid="head-place"]')!.click();
    await settle();

    expect(host().querySelector('[data-testid="coast-picker"]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });

  describe('from lg: the panel', () => {
    // The page reads the viewport and asks for venues in its constructor: a wide one replaces it.
    beforeEach(() => {
      for (const request of httpMock.match(() => true)) {
        request.flush([]);
      }
      fixture.destroy();
      globalThis.matchMedia = (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList;
      fixture = TestBed.createComponent(Home);
    });

    it('has no violations with the panel’s rows, its head and Near me beside the map', async () => {
      await openSheet();

      expect(host().querySelector('[data-testid="desk-panel"]')).not.toBeNull();
      expect(host().querySelectorAll('[data-testid="venue-row"]').length).toBe(1);
      expect(host().querySelector('[data-testid="desk-near-me"]')).not.toBeNull();
      await expectNoAxeViolations(host());
    });

    it('has no violations with a row selected and expanded by its pin', async () => {
      await openSheet();
      host().querySelector<HTMLButtonElement>('[data-testid="map-venue-pin"]')!.click();
      await settle();

      expect(host().querySelector('[data-testid="venue-row"][aria-current="true"]')).not.toBeNull();
      await expectNoAxeViolations(host());
    });

    it('has no violations with the coast picker hanging off the place button', async () => {
      await openSheet();
      host().querySelector<HTMLButtonElement>('[data-testid="head-place"]')!.click();
      await settle();

      expect(host().querySelector('[data-testid="coast-picker"]')).not.toBeNull();
      await expectNoAxeViolations(host());
    });
  });
});
