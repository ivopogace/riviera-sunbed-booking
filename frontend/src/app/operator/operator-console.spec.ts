import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { OperatorAuth } from '../core/operator-auth';
import { todayBookingDate } from '../shared/booking-date';
import { VenueMapView } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { OperatorConsole } from './operator-console';
import { PendingRequestsStore } from './pending-requests-store';

const BASE = environment.apiBaseUrl;
const VENUE = 1;

function venueMap(name: string, id = VENUE): VenueMapView {
  return {
    id,
    name,
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
function flushVenue(httpMock: HttpTestingController, name: string, venue = VENUE): void {
  httpMock
    .expectOne((r) => r.url === `${BASE}/api/venues/${venue}` && r.method === 'GET')
    .flush(venueMap(name, venue));
}

/** The Requests-badge count read the console fires once a session exists (owner-asserted server-side,
 *  invariant #13). The exact URL is pinned here (AC-8: no new unscoped call). */
function flushRequests(httpMock: HttpTestingController, pending: number, venue = VENUE): void {
  httpMock
    .expectOne((r) => r.url === `${BASE}/api/venues/${venue}/booking-requests` && r.method === 'GET')
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
 * The console shell. It carries NO sign-in gate: `operatorSessionGuard` owns that
 * and awaits the session restore, so the component only ever mounts for a signed-in operator — which
 * is what every test here models by answering the startup `/me` with a principal. The signed-out
 * redirect itself is pinned by `core/operator-session.guard.spec.ts`.
 */
describe('OperatorConsole — signed-in shell (#170, guard-gated since #277)', () => {
  let fixture: ComponentFixture<OperatorConsole>;
  let httpMock: HttpTestingController;
  let operator: OperatorAuth;

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    TestBed.configureTestingModule({ imports: [OperatorConsole], providers: baseProviders() });
    operator = TestBed.inject(OperatorAuth);
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
    await fixture.whenStable(); // the signedIn effect fires the venue-title + badge-count loads
    flushVenue(httpMock, name);
    flushRequests(httpMock, pending);
    flushStrip(httpMock); // the stats strip mounts in the shell and fires its two reads
    await fixture.whenStable();
  }

  it('renders the porcelain shell with the venue title + signed-in-as', async () => {
    await createSignedIn('Miramar Beach Club');
    expect(host().querySelector('[data-testid="oc-header"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="oc-venue-title"]')?.textContent).toContain(
      'Miramar Beach Club',
    );
    expect(host().querySelector('[data-testid="oc-signed-in-as"]')?.textContent).toContain(
      'operator',
    );
    // The console shell carries its own footer — the shell chrome (and its footer) is suppressed here.
    expect(host().querySelector('[data-testid="oc-footer"]')).not.toBeNull();
  });

  it('carries no inline sign-in card — the guard owns the gate (#277)', async () => {
    await createSignedIn();
    expect(host().querySelector('[data-testid="oc-signin-title"]')).toBeNull();
    expect(host().querySelector('[data-testid="oc-user"]')).toBeNull();
    expect(host().querySelector('[data-testid="oc-pass"]')).toBeNull();
  });

  it('leaves for the unified auth page on sign-out, clearing venue + badge state', async () => {
    // The guard gates on ACTIVATION, so the console must navigate away itself.
    await createSignedIn('Miramar Beach Club', 2);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    host().querySelector<HTMLButtonElement>('[data-testid="oc-signout"]')!.click();
    httpMock
      .expectOne(`${BASE}/api/auth/logout`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(operator.signedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/account/sign-in'], {
      queryParams: { audience: 'operator' },
    });
    expect(TestBed.inject(PendingRequestsStore).count()).toBe(0);

    // Sign-out drops the shared snapshot, so the next operator cannot inherit it.
    let refetched: string | undefined;
    TestBed.inject(ConsoleVenueMap)
      .load(VENUE, todayBookingDate(new Date()))
      .subscribe((venue) => (refetched = venue.name));
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.includes(`/api/venues/${VENUE}`))
      .flush({ id: VENUE, name: 'A different venue', sets: [] });
    expect(refetched).toBe('A different venue');
  });

  it('scopes porcelain to its own host and never mutates the global theme (#170, AC-6)', async () => {
    await createSignedIn();
    // The console renders always-porcelain by scoping the token attribute to its own host element…
    expect(host().getAttribute('data-riv-theme')).toBe('porcelain');
    // …and never writes the document-level theme (the tourist choice is preserved).
    expect(document.documentElement.getAttribute('data-riv-theme')).toBeNull();
  });

  it('renders the six pill tabs linking to the tab routes (#170, AC-1)', async () => {
    await createSignedIn();
    const nav = host().querySelector('[data-testid="oc-tabs"]')!;
    expect(nav).not.toBeNull();
    const tabs: readonly [string, string][] = [
      ['beach-map', 'Beach map'],
      ['pricing', 'Pricing'],
      ['daily', 'Daily view'],
      ['requests', 'Requests'],
      ['payouts', 'Payouts'],
      ['venue', 'Venue & commodities'],
    ];
    for (const [path, label] of tabs) {
      const link = nav.querySelector<HTMLAnchorElement>(`a[href="/operator/${VENUE}/${path}"]`);
      expect(link, `tab '${path}'`).not.toBeNull();
      expect(link?.textContent).toContain(label);
    }
  });

  it('shows the Requests tab badge with the live pending count (#170, AC-2)', async () => {
    await createSignedIn('Miramar Beach Club', 3);
    expect(host().querySelector('[data-testid="oc-requests-badge"]')?.textContent).toContain('3');
  });

  it('hides the Requests badge when there are no pending requests (#170, AC-2)', async () => {
    await createSignedIn('Miramar Beach Club', 0);
    expect(host().querySelector('[data-testid="oc-requests-badge"]')).toBeNull();
  });

  it('binds the badge to the shared store so the Requests tab keeps it in sync (#176)', async () => {
    await createSignedIn('Miramar Beach Club', 1);
    expect(host().querySelector('[data-testid="oc-requests-badge"]')?.textContent).toContain('1');
    // The Requests tab writes this store after each accept/decline — the shell badge must follow live.
    TestBed.inject(PendingRequestsStore).set(4);
    fixture.detectChanges();
    expect(host().querySelector('[data-testid="oc-requests-badge"]')?.textContent).toContain('4');
  });

  it('exposes a reachable create-venue link to the operator-home create state (#278)', async () => {
    await createSignedIn();
    const link = host().querySelector<HTMLAnchorElement>('[data-testid="oc-create-venue"]');
    expect(link?.getAttribute('href')).toBe('/operator?create=1');
  });

  it('keeps the shell working when the badge fetch fails — no badge (#170, R-4)', async () => {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    flushVenue(httpMock, 'Miramar Beach Club');
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/booking-requests` && r.method === 'GET')
      .flush({}, { status: 500, statusText: 'Server Error' });
    flushStrip(httpMock); // the strip still mounts and fires its reads even when the badge read fails
    await fixture.whenStable();

    expect(host().querySelector('[data-testid="oc-header"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="oc-requests-badge"]')).toBeNull();
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

  it('renders the shell straight away from the restored session', async () => {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    flushVenue(httpMock, 'Miramar Beach Club');
    flushRequests(httpMock, 0);
    flushStrip(httpMock); // the stats strip mounts with the restored session too
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="oc-header"]')).not.toBeNull();
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

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('reloads the header and badge when the venue param changes in place (#180, AC-1)', async () => {
    // The router REUSES the component instance when only :venueId changes — no re-construction.
    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    // The old venue's name and badge must not linger while venue 2 loads.
    expect(host().querySelector('[data-testid="oc-venue-title"]')?.textContent).toContain(
      'Your venue',
    );
    expect(host().querySelector('[data-testid="oc-requests-badge"]')).toBeNull();

    await fixture.whenStable();
    flushVenue(httpMock, 'Second Venue', 2);
    flushRequests(httpMock, 5, 2);
    flushStrip(httpMock, 2);
    await fixture.whenStable();

    expect(host().querySelector('[data-testid="oc-venue-title"]')?.textContent).toContain(
      'Second Venue',
    );
    expect(host().querySelector('[data-testid="oc-requests-badge"]')?.textContent).toContain('5');
    const nav = host().querySelector('[data-testid="oc-tabs"]')!;
    expect(nav.querySelector('a[href="/operator/2/beach-map"]')).not.toBeNull();
    expect(nav.querySelector(`a[href="/operator/${VENUE}/beach-map"]`)).toBeNull();
  });

  it('shows not-found when the param turns invalid, and recovers (#180, AC-3)', async () => {
    params$.next(convertToParamMap({ venueId: 'foo' }));
    fixture.detectChanges();

    expect(host().querySelector('[data-testid="oc-invalid-venue"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="oc-header"]')).toBeNull();
    // No venue reads fire for an invalid id.
    httpMock.expectNone((r) => r.url.startsWith(`${BASE}/api/venues/`));

    params$.next(convertToParamMap({ venueId: '2' }));
    await fixture.whenStable();
    flushVenue(httpMock, 'Second Venue', 2);
    flushRequests(httpMock, 0, 2);
    flushStrip(httpMock, 2);
    await fixture.whenStable();

    expect(host().querySelector('[data-testid="oc-invalid-venue"]')).toBeNull();
    expect(host().querySelector('[data-testid="oc-venue-title"]')?.textContent).toContain(
      'Second Venue',
    );
  });
});

describe('OperatorConsole — invalid venue id (#170 review finding 1)', () => {
  let fixture: ComponentFixture<OperatorConsole>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    TestBed.configureTestingModule({
      imports: [OperatorConsole],
      providers: baseProviders(routeStub('foo').route),
    });
    TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    // Sign the operator IN, to prove even an authenticated operator sees not-found — never the
    // broken shell whose tab routerLinks would interpolate the undefined venue id.
    httpMock
      .expectOne(`${BASE}/api/auth/me`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await Promise.resolve();
    await Promise.resolve();
  });

  afterEach(() => httpMock.verify());

  it('shows a not-found state, never the tab shell, and fires no venue reads', async () => {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="oc-invalid-venue"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="oc-header"]')).toBeNull();
    expect(host.querySelector('[data-testid="oc-tabs"]')).toBeNull();
    // venueId is invalid → the venue-title + badge reads are skipped (only the flushed /me went out).
    httpMock.expectNone(() => true);
  });
});
