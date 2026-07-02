import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { environment } from '../../environments/environment';
import { OperatorAuth } from '../core/operator-auth';
import { SetView, VenueMapView } from '../venue/venue.model';
import { DailyBookingItem } from './staff.model';
import { StaffDaily } from './staff-daily';

const BASE = environment.apiBaseUrl;
const VENUE = 1;

function set(id: number, availability: SetView['availability'], pool: SetView['pool']): SetView {
  return {
    id,
    rowLabel: 'Row A',
    positionNo: id,
    tier: 'STANDARD',
    pool,
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX: id,
    gridY: 1,
    availability,
  };
}

function venueWith(sets: readonly SetView[]): VenueMapView {
  return {
    id: VENUE,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: 'Loungers on the shore.',
    ratingTenths: 48,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    sets,
  };
}

// set 1 FREE/ONLINE (mark), set 2 TAKEN+booked (online, locked), set 3 TAKEN not-booked (staff mark),
// set 4 FREE/WALK_IN (mark).
const SETS: readonly SetView[] = [
  set(1, 'FREE', 'ONLINE'),
  set(2, 'TAKEN', 'ONLINE'),
  set(3, 'TAKEN', 'ONLINE'),
  set(4, 'FREE', 'WALK_IN'),
];
const BOOKINGS: readonly DailyBookingItem[] = [{ setId: 2, code: 'ONLINE0001' }];

describe('StaffDaily', () => {
  let fixture: ComponentFixture<StaffDaily>;
  let httpMock: HttpTestingController;
  let operator: OperatorAuth;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [StaffDaily],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ venueId: String(VENUE) }) } },
        },
      ],
    });
    operator = TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    // Constructing OperatorAuth fires the session restore (GET /api/auth/me, issue #109);
    // answer 401 so every test starts signed out, then drain microtasks so restoring() settles.
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

  /** Establish an operator session: post the credential and flush the login POST (issue #109). */
  async function signIn(): Promise<void> {
    const result = operator.signIn('operator', 'pw');
    httpMock
      .expectOne(`${BASE}/api/auth/operator/login`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await result;
  }

  function flushLoad(
    sets: readonly SetView[] = SETS,
    bookings: readonly DailyBookingItem[] = BOOKINGS,
  ): void {
    httpMock.expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}` && r.method === 'GET').flush(venueWith(sets));
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/bookings` && r.method === 'GET')
      .flush(bookings);
  }

  async function createSignedIn(): Promise<void> {
    await signIn();
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable(); // the signedIn effect fires the venue + bookings loads
    flushLoad();
    await fixture.whenStable();
  }

  function tile(id: number): HTMLElement | null {
    return host().querySelector<HTMLElement>(`[data-set-id="${id}"]`);
  }

  it('shows the sign-in form and loads nothing when signed out', async () => {
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable();
    expect(host().querySelector('#signin-title')).not.toBeNull();
    // No venue/bookings request — only the (already flushed) /me restore has gone out.
    httpMock.expectNone(() => true);
  });

  it('loads the map and bookings, classifying tile state', async () => {
    await createSignedIn();

    // FREE/online + FREE/walk-in are markable buttons; the staff-marked tile is a release button;
    // the online-booked tile is a non-actionable static cell.
    expect(tile(1)?.getAttribute('data-state')).toBe('FREE');
    expect(tile(4)?.getAttribute('data-state')).toBe('FREE');
    expect(tile(3)?.getAttribute('data-state')).toBe('STAFF_MARKED');
    expect(tile(2)).toBeNull(); // online-held → rendered as a static cell, not a button

    // The booking code is listed for the online-held set.
    expect(host().querySelector('[data-testid="booking-row"]')?.textContent).toContain('ONLINE0001');
  });

  it('marks a free set optimistically, then reconciles to server truth', async () => {
    await createSignedIn();

    tile(1)!.click();
    await fixture.whenStable();
    // Optimistic: the tile flips to STAFF_MARKED before the POST resolves.
    expect(tile(1)?.getAttribute('data-state')).toBe('STAFF_MARKED');

    const post = httpMock.expectOne(`${BASE}/api/venues/${VENUE}/sets/1/availability`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ date: fixtureDate() });
    post.flush({ state: 'STAFF_MARKED' });
    await fixture.whenStable();

    // Reconcile: re-reads the map (set 1 now TAKEN) + bookings (still just set 2).
    flushLoad([set(1, 'TAKEN', 'ONLINE'), ...SETS.slice(1)], BOOKINGS);
    await fixture.whenStable();
    expect(tile(1)?.getAttribute('data-state')).toBe('STAFF_MARKED');
  });

  it('reverts and notifies when a mark loses the race (ALREADY_TAKEN)', async () => {
    await createSignedIn();

    tile(1)!.click();
    await fixture.whenStable();
    httpMock
      .expectOne(`${BASE}/api/venues/${VENUE}/sets/1/availability`)
      .flush({ status: 409, code: 'ALREADY_TAKEN' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    // Reconcile shows the truth: set 1 was taken online by someone else.
    flushLoad([set(1, 'TAKEN', 'ONLINE'), ...SETS.slice(1)], [
      { setId: 1, code: 'RACEWON001' },
      ...BOOKINGS,
    ]);
    await fixture.whenStable();

    expect(host().querySelector('[data-testid="notice"]')?.textContent).toContain('just taken');
    expect(tile(1)).toBeNull(); // now online-held → static cell, not actionable
  });

  it('releases a staff-marked set, then reconciles it back to free', async () => {
    await createSignedIn();

    tile(3)!.click();
    await fixture.whenStable();
    expect(tile(3)?.getAttribute('data-state')).toBe('FREE'); // optimistic release

    const del = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/${VENUE}/sets/3/availability` && r.method === 'DELETE',
    );
    del.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    flushLoad([SETS[0], SETS[1], set(3, 'FREE', 'ONLINE'), SETS[3]], BOOKINGS);
    await fixture.whenStable();
    expect(tile(3)?.getAttribute('data-state')).toBe('FREE');
  });

  it('notifies and reconciles when a release loses (NOT_MARKED)', async () => {
    await createSignedIn();

    tile(3)!.click(); // staff-marked → release
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/sets/3/availability` && r.method === 'DELETE')
      .flush({ status: 409, code: 'NOT_MARKED' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    // Reconcile shows the truth: set 3 was actually held online, not a staff mark.
    flushLoad([SETS[0], SETS[1], set(3, 'TAKEN', 'ONLINE'), SETS[3]], [
      { setId: 3, code: 'WASONLINE1' },
      ...BOOKINGS,
    ]);
    await fixture.whenStable();
    expect(host().querySelector('[data-testid="notice"]')?.textContent).toContain('not a walk-in');
  });

  it('signs the operator out when a mark returns 401', async () => {
    await createSignedIn();

    tile(1)!.click();
    await fixture.whenStable();
    httpMock
      .expectOne(`${BASE}/api/venues/${VENUE}/sets/1/availability`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    // onWriteError still reconciles; sessionLost() drops the state with NO logout round-trip,
    // so the only open requests are the reconcile reads.
    flushLoad();
    await fixture.whenStable();
    expect(operator.signedIn()).toBe(false);
    expect(host().querySelector('#signin-title')).not.toBeNull();
  });

  it('signs out when the bookings load returns 401', async () => {
    await signIn();
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable();
    httpMock.expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}` && r.method === 'GET').flush(venueWith(SETS));
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/${VENUE}/bookings` && r.method === 'GET')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    expect(operator.signedIn()).toBe(false);
  });

  it('signs in through the form and out through the header button', async () => {
    fixture = TestBed.createComponent(StaffDaily);
    await fixture.whenStable();

    const user = host().querySelector<HTMLInputElement>('#op-user')!;
    user.value = 'operator';
    user.dispatchEvent(new Event('input'));
    const pass = host().querySelector<HTMLInputElement>('#op-pass')!;
    pass.value = 'pw';
    pass.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    // The submit posts the credential to the login endpoint (issue #109); once it succeeds,
    // signedIn flips and the constructor effect fires the venue + bookings loads.
    httpMock
      .expectOne(`${BASE}/api/auth/operator/login`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await fixture.whenStable();
    flushLoad();
    await fixture.whenStable();
    expect(operator.signedIn()).toBe(true);
    expect(host().querySelector('#daily-title')).not.toBeNull();

    const signOut = [...host().querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Sign out'),
    ) as HTMLButtonElement;
    signOut.click();
    // Sign-out invalidates the server session before the local state clears.
    httpMock
      .expectOne(`${BASE}/api/auth/logout`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(operator.signedIn()).toBe(false);
    expect(host().querySelector('#signin-title')).not.toBeNull();
  });

  it('reloads for the newly chosen date', async () => {
    await createSignedIn();

    const input = host().querySelector<HTMLInputElement>('[data-testid="daily-date"]')!;
    input.value = '2099-01-15';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    // A fresh load for the new day; the map/bookings for 2099-01-15 are applied.
    flushLoad([set(1, 'TAKEN', 'ONLINE')], []);
    await fixture.whenStable();
    expect(input.value).toBe('2099-01-15');
    expect(host().querySelector('[data-testid="bookings-empty"]')).not.toBeNull();
  });

  /** The date the component opens on (today in Europe/Tirane) — read back off the date input. */
  function fixtureDate(): string {
    return (host().querySelector<HTMLInputElement>('[data-testid="daily-date"]'))!.value;
  }
});
