import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { OperatorAuth } from '../core/operator-auth';
import { VenueMapView } from '../venue/venue.model';
import { OperatorConsole } from './operator-console';

const BASE = environment.apiBaseUrl;
const VENUE = 1;

function venueMap(name: string): VenueMapView {
  return {
    id: VENUE,
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

function baseProviders() {
  return [
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: { snapshot: { paramMap: convertToParamMap({ venueId: String(VENUE) }) } },
    },
  ];
}

/** The venue-title read the console fires once a session exists (best-effort, date-independent). */
function flushVenue(httpMock: HttpTestingController, name: string): void {
  httpMock
    .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}` && r.method === 'GET')
    .flush(venueMap(name));
}

/** The Requests-badge count read the console fires once a session exists (owner-asserted server-side,
 *  invariant #13). The exact URL is pinned here (AC-8: no new unscoped call). */
function flushRequests(httpMock: HttpTestingController, pending: number): void {
  httpMock
    .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/booking-requests` && r.method === 'GET')
    .flush(Array.from({ length: pending }, (_, i) => ({ bookingId: i + 1 })));
}

describe('OperatorConsole — signed out (sign-in gate, #170)', () => {
  let fixture: ComponentFixture<OperatorConsole>;
  let httpMock: HttpTestingController;
  let operator: OperatorAuth;

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    TestBed.configureTestingModule({ imports: [OperatorConsole], providers: baseProviders() });
    operator = TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    // Constructing OperatorAuth fires the session restore (GET /api/auth/me, issue #109); answer 401
    // so the test starts signed out, then drain microtasks so restoring() settles.
    httpMock
      .expectOne(`${BASE}/api/auth/me`)
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    await Promise.resolve();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function signIn(): Promise<void> {
    const result = operator.signIn('operator', 'pw');
    httpMock
      .expectOne(`${BASE}/api/auth/operator/login`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await result;
  }

  async function createSignedIn(name = 'Miramar Beach Club', pending = 0): Promise<void> {
    await signIn();
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable(); // the signedIn effect fires the venue-title + badge-count loads
    flushVenue(httpMock, name);
    flushRequests(httpMock, pending);
    await fixture.whenStable();
  }

  it('shows the glass sign-in card, not the shell, when signed out', async () => {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    expect(host().querySelector('[data-testid="oc-signin-title"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="oc-header"]')).toBeNull();
    // No venue read while signed out — only the (already flushed) /me restore has gone out.
    httpMock.expectNone(() => true);
  });

  it('renders the porcelain shell with the venue title + signed-in-as after a successful sign-in', async () => {
    await createSignedIn('Miramar Beach Club');
    expect(host().querySelector('[data-testid="oc-header"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="oc-venue-title"]')?.textContent).toContain(
      'Miramar Beach Club',
    );
    expect(host().querySelector('[data-testid="oc-signed-in-as"]')?.textContent).toContain(
      'operator',
    );
    expect(host().querySelector('[data-testid="oc-signin-title"]')).toBeNull();
  });

  it('shows generic failure copy on a bad sign-in and stays on the card', async () => {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();

    const user = host().querySelector<HTMLInputElement>('[data-testid="oc-user"]')!;
    user.value = 'operator';
    user.dispatchEvent(new Event('input'));
    const pass = host().querySelector<HTMLInputElement>('[data-testid="oc-pass"]')!;
    pass.value = 'wrong';
    pass.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    httpMock
      .expectOne(`${BASE}/api/auth/operator/login`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    // Generic copy (design D-8): the card never says whether the username or password was wrong.
    expect(host().querySelector('[data-testid="oc-signin-error"]')?.textContent).toContain(
      'Sign-in failed',
    );
    expect(host().querySelector('[data-testid="oc-header"]')).toBeNull();
  });

  it('returns to the sign-in card on sign-out', async () => {
    await createSignedIn();

    const signOut = host().querySelector<HTMLButtonElement>('[data-testid="oc-signout"]')!;
    signOut.click();
    httpMock
      .expectOne(`${BASE}/api/auth/logout`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(operator.signedIn()).toBe(false);
    expect(host().querySelector('[data-testid="oc-signin-title"]')).not.toBeNull();
    expect(host().querySelector('[data-testid="oc-header"]')).toBeNull();
  });

  it('scopes porcelain to its own host and never mutates the global theme (#170, AC-6)', async () => {
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
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

  it('exposes a reachable create-venue link to the legacy onboarding (#170, AC-5)', async () => {
    await createSignedIn();
    const link = host().querySelector<HTMLAnchorElement>('[data-testid="oc-create-venue"]');
    expect(link?.getAttribute('href')).toBe('/venue-admin');
  });

  it('keeps the shell working when the badge fetch fails — no badge (#170, R-4)', async () => {
    await signIn();
    fixture = TestBed.createComponent(OperatorConsole);
    await fixture.whenStable();
    flushVenue(httpMock, 'Miramar Beach Club');
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/booking-requests` && r.method === 'GET')
      .flush({}, { status: 500, statusText: 'Server Error' });
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
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="oc-header"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="oc-signin-title"]')).toBeNull();
  });
});
