import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { environment } from '../../environments/environment';
import { OperatorAuth } from '../core/operator-auth';
import { routes } from '../app.routes';
import { LayoutEditor } from './layout-editor';
import { OperatorConsole } from './operator-console';

const BASE = environment.apiBaseUrl;

/**
 * The in-place venue-switch integration proof, on the REAL route config: `/operator/1/beach-map` →
 * `/operator/2/beach-map` REUSES the console shell and the tab component (same route config, only
 * the param differs — the router never re-constructs), and the reactive `venueId` signals still
 * re-load everything for venue 2. This is the exact navigation an in-app venue switcher would
 * perform; unit specs push params through a mocked route, so only this harness spec would catch a
 * regression in how the real router delivers an in-place param change.
 */
describe('Operator console — in-place venue switch over the real routes (#180)', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
    http = TestBed.inject(HttpTestingController);
    // The operatorSessionGuard awaits the session restore — answer /me with a principal up front.
    TestBed.inject(OperatorAuth);
    http
      .expectOne(`${BASE}/api/auth/me`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  /** Flush every read the shell + strip + layout tab fire for a venue (order-independent). */
  function flushVenueReads(id: number, name: string): void {
    // Two venue-map GETs: the shell's shared-snapshot read + the layout editor's direct read.
    http
      .match((r) => r.method === 'GET' && r.url === `${BASE}/api/venues/${id}`)
      .forEach((req) =>
        req.flush({
          id,
          name,
          beach: 'Ksamil',
          region: 'Riviera',
          description: '',
          ratingTenths: 40,
          reviewsCount: 1,
          bookingMode: 'INSTANT',
          fromPrice: null,
          sets: [],
          setVersion: 1,
        }),
      );
    http
      .match((r) => r.url === `${BASE}/api/venues/${id}/booking-requests`)
      .forEach((req) => req.flush([{ bookingId: id * 10 }]));
    http.match((r) => r.url === `${BASE}/api/venues/${id}/bookings`).forEach((req) => req.flush([]));
    http
      .match((r) => r.url === `${BASE}/api/venues/${id}/availability`)
      .forEach((req) => req.flush([]));
    http
      .match((r) => r.url === `${BASE}/api/venues/${id}/takings`)
      .forEach((req) =>
        req.flush({
          gross: { minorUnits: 0, currency: 'EUR' },
          net: { minorUnits: 0, currency: 'EUR' },
          commissionBps: 1500,
          date: '2026-06-15',
        }),
      );
  }

  function shell(): OperatorConsole {
    return harness.fixture.debugElement.query(By.directive(OperatorConsole)).componentInstance;
  }

  function tab(): LayoutEditor {
    return harness.fixture.debugElement.query(By.directive(LayoutEditor)).componentInstance;
  }

  function text(testid: string): string {
    return (
      (harness.fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testid}"]`)
        ?.textContent ?? ''
    );
  }

  it('reuses the shell + tab instances yet re-loads everything for the new venue', async () => {
    await harness.navigateByUrl('/operator/1/beach-map');
    await harness.fixture.whenStable();
    flushVenueReads(1, 'First Venue');
    harness.fixture.detectChanges();

    expect(text('oc-venue-title')).toContain('First Venue');
    const firstShell = shell();
    const firstTab = tab();

    await harness.navigateByUrl('/operator/2/beach-map');
    await harness.fixture.whenStable();
    flushVenueReads(2, 'Second Venue');
    harness.fixture.detectChanges();

    // The router REUSED both instances (no re-construction)…
    expect(shell()).toBe(firstShell);
    expect(tab()).toBe(firstTab);
    // …and the reactive param still re-loaded the header, badge and tab links for venue 2.
    expect(text('oc-venue-title')).toContain('Second Venue');
    expect(text('oc-requests-badge')).toContain('1');
    const nav = (harness.fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="oc-tabs"]',
    )!;
    expect(nav.querySelector('a[href="/operator/2/pricing"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/operator/1/pricing"]')).toBeNull();
  });
});
