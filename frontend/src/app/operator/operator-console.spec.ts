import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { environment } from '../../environments/environment';
import { OperatorAuth } from '../core/operator-auth';
import { addDays, todayBookingDate } from '../shared/booking-date';
import { SeatAvailability, SetView, VenueMapView } from '../shared/venue-views';
import { AvailabilityChanges } from './availability-changes';
import { OperatorConsole } from './operator-console';
import { PendingRequestsStore } from './pending-requests-store';

const BASE = environment.apiBaseUrl;
const VENUE = 1;

function venueMap(name: string, id = VENUE, sets: SetView[] = []): VenueMapView {
  return {
    id,
    name,
    beach: 'KSAMIL',
    region: 'SARANDE',
    description: 'Loungers on the shore.',
    ratingTenths: 48,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: null,
    sets,
  };
}

function set(id: number, availability: SeatAvailability): SetView {
  return {
    id,
    rowLabel: 'A',
    positionNo: id,
    tier: 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 4000, currency: 'EUR' },
    gridX: id,
    gridY: 0,
    availability,
  };
}

/** BehaviorSubject-backed route stub — the param-change tests push new maps through it. */
function routeStub(venueId: string): {
  params$: BehaviorSubject<ParamMap>;
  route: Partial<ActivatedRoute>;
} {
  const params$ = new BehaviorSubject(convertToParamMap({ venueId }));
  return { params$, route: { snapshot: { paramMap: params$.value }, paramMap: params$ } as never };
}

function baseProviders(route: Partial<ActivatedRoute> = routeStub(String(VENUE)).route) {
  return [
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
    { provide: ActivatedRoute, useValue: route },
  ];
}

/** The venue-title read the console fires once a session exists (best-effort, date-independent). */
function flushVenue(
  httpMock: HttpTestingController,
  name: string,
  venue = VENUE,
  sets: SetView[] = [],
): void {
  httpMock
    .expectOne((r) => r.url === `${BASE}/api/venues/${venue}` && r.method === 'GET')
    .flush(venueMap(name, venue, sets));
}

/** The Requests-badge count read the console fires once a session exists (owner-asserted server-side,
 *  invariant #13). The exact URL is pinned here (no new unscoped call). */
function flushRequests(httpMock: HttpTestingController, pending: number, venue = VENUE): void {
  httpMock
    .expectOne(
      (r) => r.url === `${BASE}/api/venues/${venue}/booking-requests` && r.method === 'GET',
    )
    .flush(Array.from({ length: pending }, (_, i) => ({ bookingId: i + 1 })));
}

/**
 * The stats-strip reads the signed-in shell mounts: the booked-online count, the daily
 * takings and the availability states. URLs pinned (owner-asserted server-side, invariant
 * #13); all best-effort in the strip, so flushing zeros keeps every shell-rendering test green
 * without asserting on the strip itself.
 */
function flushStrip(httpMock: HttpTestingController, venue = VENUE): void {
  httpMock
    .expectOne((r) => r.url === `${BASE}/api/venues/${venue}/bookings` && r.method === 'GET')
    .flush([]);
  httpMock
    .expectOne((r) => r.url === `${BASE}/api/venues/${venue}/takings` && r.method === 'GET')
    .flush({
      gross: { minorUnits: 0, currency: 'EUR' },
      net: { minorUnits: 0, currency: 'EUR' },
      commissionBps: 1500,
      date: '2026-07-07',
    });
  httpMock
    .expectOne((r) => r.url === `${BASE}/api/venues/${venue}/availability` && r.method === 'GET')
    .flush([]);
}

/**
 * The venue console's page: the stats strip, the banner and the tab outlet, plus the per-venue
 * seeding of the shared snapshot and the badge store the console shell renders. It carries NO
 * sign-in gate: `operatorSessionGuard` owns that and awaits the session restore, so the component
 * only ever mounts for a signed-in operator — which is what every test here models by answering
 * the startup `/me` with a principal. The signed-out redirect itself is pinned by
 * `core/operator-session.guard.spec.ts`; the chrome around the page by `console-shell.spec.ts`.
 */
describe('OperatorConsole — signed-in page (#170, guard-gated since #277)', () => {
  let fixture: ComponentFixture<OperatorConsole>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    TestBed.configureTestingModule({ imports: [OperatorConsole], providers: baseProviders() });
    TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    // The guard only activates this route for a signed-in operator, so the restore answers a principal.
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

  async function createSignedIn(name = 'Miramar Beach Club', pending = 0): Promise<void> {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable(); // the signedIn effect fires the venue-map + badge-count loads
    flushVenue(httpMock, name);
    flushRequests(httpMock, pending);
    flushStrip(httpMock); // the stats strip mounts in the page and fires its three reads
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders no header, rail or footer of its own — the shell wears them (#1011)', async () => {
    await createSignedIn('Miramar Beach Club');
    expect(host().querySelector('header')).toBeNull();
    expect(host().querySelector('nav')).toBeNull();
    expect(host().querySelector('footer')).toBeNull();
    expect(host().querySelector('main')).toBeNull();
    expect(host().querySelector('[data-testid="oc-venue-title"]')).toBeNull();
    expect(host().querySelector('[data-testid="oc-account"]')).toBeNull();
    // What it does render: the strip, the banner and the tab outlet, in the wide page box.
    expect(host().querySelector('app-console-stats-strip')).not.toBeNull();
    expect(host().querySelector('app-pending-approval-banner')).not.toBeNull();
    expect(host().querySelector('router-outlet')).not.toBeNull();
    expect(host().querySelector('.oc-main')).not.toBeNull();
  });

  it('carries no inline sign-in card — the guard owns the gate (#277)', async () => {
    await createSignedIn();
    expect(host().querySelector('[data-testid="oc-signin-title"]')).toBeNull();
    expect(host().querySelector('[data-testid="oc-user"]')).toBeNull();
    expect(host().querySelector('[data-testid="oc-pass"]')).toBeNull();
  });

  it('carries no porcelain pin of its own — the app shell pins every console route (#1011)', async () => {
    await createSignedIn();
    expect(host().getAttribute('data-riv-theme')).toBeNull();
    expect(document.documentElement.getAttribute('data-riv-theme')).toBeNull();
  });

  it('seeds the shared badge store from the pending-count read (#170, AC-2)', async () => {
    await createSignedIn('Miramar Beach Club', 3);
    expect(TestBed.inject(PendingRequestsStore).count()).toBe(3);
  });

  it('seeds the store at zero when nothing is pending (#170, AC-2)', async () => {
    await createSignedIn('Miramar Beach Club', 0);
    expect(TestBed.inject(PendingRequestsStore).count()).toBe(0);
  });

  it('keeps the shell working when the badge fetch fails — no badge (#170, R-4)', async () => {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    flushVenue(httpMock, 'Miramar Beach Club');
    httpMock
      .expectOne(
        (r) => r.url === `${BASE}/api/venues/${VENUE}/booking-requests` && r.method === 'GET',
      )
      .flush({}, { status: 500, statusText: 'Server Error' });
    flushStrip(httpMock); // the strip still mounts and fires its reads even when the badge read fails
    await fixture.whenStable();

    expect(host().querySelector('app-console-stats-strip')).not.toBeNull();
    expect(TestBed.inject(PendingRequestsStore).count()).toBe(0);
  });
});

describe('OperatorConsole — an announced walk-in change (#1525)', () => {
  let fixture: ComponentFixture<OperatorConsole>;
  let httpMock: HttpTestingController;
  const TODAY = todayBookingDate(new Date());

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    TestBed.configureTestingModule({ imports: [OperatorConsole], providers: baseProviders() });
    TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(`${BASE}/api/auth/me`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await Promise.resolve();
    await Promise.resolve();

    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    // Two of three free before the mark.
    flushVenue(httpMock, 'Miramar Beach Club', VENUE, [
      set(1, 'FREE'),
      set(2, 'FREE'),
      set(3, 'TAKEN'),
    ]);
    flushRequests(httpMock, 3);
    flushStrip(httpMock);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function freeTile(): string {
    return (
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="oc-stat-free"]')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
    );
  }

  it('re-reads the shared map from the server, keeping the current one up meanwhile, and never re-seeds the badge (AC-6)', async () => {
    expect(freeTile()).toBe('2 / 3');
    // The Requests tab has taken authority since; a refresh must not clobber it back to the seed.
    TestBed.inject(PendingRequestsStore).set(1);

    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: TODAY });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(freeTile()).toBe('2 / 3'); // no "0 / 0" flash while the fresh read is out
    // The snapshot was dropped by the announce, so this is a real server read, dated today.
    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/${VENUE}` && r.method === 'GET',
    );
    expect(req.request.params.get('date')).toBe(TODAY);
    req.flush(
      venueMap('Miramar Beach Club', VENUE, [set(1, 'TAKEN'), set(2, 'FREE'), set(3, 'TAKEN')]),
    );
    // The strip's own held re-read (pinned in its spec); answered so verify() stays clean.
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/availability` && r.method === 'GET')
      .flush([
        { setId: 1, state: 'STAFF_MARKED' },
        { setId: 3, state: 'BOOKED_ONLINE' },
      ]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(freeTile()).toBe('1 / 3');
    expect(TestBed.inject(PendingRequestsStore).count()).toBe(1);
    httpMock.expectNone((r) => r.url === `${BASE}/api/venues/${VENUE}/booking-requests`);
  });

  it('keeps the current map when the refresh read fails — free/total are one object, so neither goes blank', async () => {
    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: TODAY });
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}` && r.method === 'GET')
      .flush({}, { status: 500, statusText: 'Server Error' });
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/availability` && r.method === 'GET')
      .flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(freeTile()).toBe('2 / 3');
  });

  it('latest map read wins when two refreshes overlap (R-3)', async () => {
    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: TODAY });
    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: TODAY });
    await fixture.whenStable();
    const [first, second] = httpMock.match(
      (r) => r.url === `${BASE}/api/venues/${VENUE}` && r.method === 'GET',
    );
    second.flush(
      venueMap('Miramar Beach Club', VENUE, [set(1, 'TAKEN'), set(2, 'TAKEN'), set(3, 'TAKEN')]),
    );
    first.flush(
      venueMap('Miramar Beach Club', VENUE, [set(1, 'TAKEN'), set(2, 'FREE'), set(3, 'TAKEN')]),
    );
    // The strip's two held re-reads (pinned in its spec); answered so verify() stays clean.
    httpMock
      .match((r) => r.url === `${BASE}/api/venues/${VENUE}/availability` && r.method === 'GET')
      .forEach((req) => req.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(freeTile()).toBe('0 / 3');
  });

  it('ignores a change for another venue or another day (AC-6, R-2)', async () => {
    TestBed.inject(AvailabilityChanges).announce({ venueId: 2, date: TODAY });
    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: addDays(TODAY, 1) });
    await fixture.whenStable();

    httpMock.expectNone((r) => r.url === `${BASE}/api/venues/${VENUE}`);
    expect(freeTile()).toBe('2 / 3');
  });
});

describe('OperatorConsole — restored session (reload survival, #170 AC-3)', () => {
  let fixture: ComponentFixture<OperatorConsole>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    TestBed.configureTestingModule({ imports: [OperatorConsole], providers: baseProviders() });
    TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    // A reload with a live session: GET /api/auth/me returns the principal, so the operator is
    // signed in without re-entering credentials.
    httpMock
      .expectOne(`${BASE}/api/auth/me`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await Promise.resolve();
    await Promise.resolve();
  });

  afterEach(() => httpMock.verify());

  it('renders the page straight away from the restored session', async () => {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    flushVenue(httpMock, 'Miramar Beach Club');
    flushRequests(httpMock, 0);
    flushStrip(httpMock); // the stats strip mounts with the restored session too
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('app-console-stats-strip')).not.toBeNull();
  });
});

describe('OperatorConsole — in-place venue param change (#180)', () => {
  let fixture: ComponentFixture<OperatorConsole>;
  let httpMock: HttpTestingController;
  let params$: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    const stub = routeStub(String(VENUE));
    params$ = stub.params$;
    TestBed.configureTestingModule({
      imports: [OperatorConsole],
      providers: baseProviders(stub.route),
    });
    TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(`${BASE}/api/auth/me`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await Promise.resolve();
    await Promise.resolve();

    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    flushVenue(httpMock, 'First Venue');
    flushRequests(httpMock, 3);
    flushStrip(httpMock);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('reloads the strip and re-seeds the badge when the venue param changes in place (#180, AC-1)', async () => {
    // The router REUSES the component instance when only :venueId changes — no re-construction.
    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    // The old venue's badge must not linger while venue 2 loads.
    expect(TestBed.inject(PendingRequestsStore).count()).toBe(0);

    await fixture.whenStable();
    flushVenue(httpMock, 'Second Venue', 2);
    flushRequests(httpMock, 5, 2);
    flushStrip(httpMock, 2);
    await fixture.whenStable();

    expect(TestBed.inject(PendingRequestsStore).count()).toBe(5);
  });
});
