import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { defaultBookingDate, todayBookingDate } from '../shared/booking-date';
import { Pool, SetView, Tier } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { DailyViewTab } from './daily-view-tab';

/**
 * The Daily view tab. Reads `:venueId` from the PARENT route (child routes don't inherit
 * it), loads the venue map + the day's confirmed bookings, and renders the sea-facing
 * availability grid + the Arrivals list. Drives: the three tile states (FREE / booked-online-locked /
 * staff-marked); tap-to-mark and tap-to-release round-trips with optimistic flip + reconcile; the
 * online-booked lock; the arrivals code chips (display-only, invariant #7); the Tirane default date +
 * reload-on-change; and the mark/release 403/401 failure copy (invariant #13).
 */
describe('DailyViewTab (#175)', () => {
  let fixture: ComponentFixture<DailyViewTab>;
  let http: HttpTestingController;
  let host: HTMLElement;
  let params$: BehaviorSubject<ParamMap>;

  // A1 FREE (tap→mark); A2 TAKEN + booked online (locked); A3 TAKEN staff-marked (tap→release);
  // B1 FREE walk-in.
  const SEED: SetView[] = [
    seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'FREE'),
    seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 'TAKEN'),
    seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'TAKEN'),
    seat(4, 'B', 1, 'STANDARD', 'WALK_IN', 'FREE'),
  ];
  const BOOKINGS = [{ setId: 2, code: 'ABC12345' }]; // set 2 is held by a confirmed online booking
  // Server states — the tile-classification authority; FREE sets are absent.
  const STATES = [
    { setId: 2, state: 'BOOKED_ONLINE' },
    { setId: 3, state: 'STAFF_MARKED' },
  ];

  /** `beforeCreate` runs after the injector exists but before the tab mounts — the shell's window. */
  function configure(beforeCreate?: () => void): void {
    params$ = new BehaviorSubject(convertToParamMap({ venueId: '1' }));
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
            parent: { snapshot: { paramMap: params$.value }, paramMap: params$ },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    beforeCreate?.();
    fixture = TestBed.createComponent(DailyViewTab);
    fixture.detectChanges();
    // OperatorAuth restores the session on construction — settle it signed-out (the shell gates access).
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
  }

  /** Flush one load cycle: the venue-map, daily-bookings and availability-states GETs. */
  function flushLoad(
    sets: SetView[] = SEED,
    bookings = BOOKINGS,
    states: { setId: number; state: string }[] = STATES,
  ): void {
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings'))
      .flush(bookings);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/availability'))
      .flush(states);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/bookings') &&
          !r.url.includes('/availability'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets });
    fixture.detectChanges();
  }

  function render(
    sets: SetView[] = SEED,
    bookings = BOOKINGS,
    states: { setId: number; state: string }[] = STATES,
  ): void {
    configure();
    flushLoad(sets, bookings, states);
    host = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  function byId(id: string): HTMLElement {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  }

  /** The interactive/locked element for a set (button when actionable, span when locked). */
  function tile(setId: number): HTMLElement {
    return host.querySelector<HTMLElement>(`[data-set-id="${setId}"]`)!;
  }

  it('renders the three tile states and locks the online-booked set', () => {
    render();
    expect(tile(1).getAttribute('data-state')).toBe('FREE');
    expect(tile(2).getAttribute('data-state')).toBe('BOOKED_ONLINE');
    expect(tile(3).getAttribute('data-state')).toBe('STAFF_MARKED');
    // FREE + STAFF_MARKED are actionable buttons; the online-booked tile is a non-actionable span.
    expect(tile(1).tagName).toBe('BUTTON');
    expect(tile(3).tagName).toBe('BUTTON');
    expect(tile(2).tagName).toBe('SPAN');
  });

  it('locks an unpaid online hold — server state wins over the confirmed-bookings list (#207)', () => {
    // Set 3: claimed BOOKED_ONLINE, unpaid, absent from bookings — the old derivation showed ✓.
    render(SEED, BOOKINGS, [
      { setId: 2, state: 'BOOKED_ONLINE' },
      { setId: 3, state: 'BOOKED_ONLINE' },
    ]);
    expect(tile(3).getAttribute('data-state')).toBe('BOOKED_ONLINE');
    expect(tile(3).tagName).toBe('SPAN');
  });

  it('marks a free set: POST + optimistic flip, then reconciles to server truth', () => {
    render();
    (tile(1) as HTMLButtonElement).click();
    fixture.detectChanges();

    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url.includes('/api/venues/1/sets/1/availability'),
    );
    expect(req.request.body).toEqual({ date: todayBookingDate(new Date()) });
    // Optimistic: tile 1 already shows STAFF_MARKED before the server responds.
    expect(tile(1).getAttribute('data-state')).toBe('STAFF_MARKED');
    req.flush(null);
    // Reconcile re-reads map + bookings + states; the server now reports set 1 staff-marked.
    flushLoad([seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'TAKEN'), ...SEED.slice(1)], BOOKINGS, [
      { setId: 1, state: 'STAFF_MARKED' },
      ...STATES,
    ]);
    expect(tile(1).getAttribute('data-state')).toBe('STAFF_MARKED');
  });

  it('releases a staff-marked set: DELETE + optimistic free, then reconciles', () => {
    render();
    (tile(3) as HTMLButtonElement).click();
    fixture.detectChanges();

    http
      .expectOne((r) => r.method === 'DELETE' && r.url.includes('/api/venues/1/sets/3/availability'))
      .flush(null);
    expect(tile(3).getAttribute('data-state')).toBe('FREE'); // optimistic release
    flushLoad([...SEED.slice(0, 2), seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'FREE'), SEED[3]], BOOKINGS, [
      { setId: 2, state: 'BOOKED_ONLINE' },
    ]);
    expect(tile(3).getAttribute('data-state')).toBe('FREE');
  });

  it('keeps a concurrent tap optimistic while another tap reconciles (no lost pending / duplicate write)', () => {
    render();
    // Tap set 1 (mark) — POST A in flight.
    (tile(1) as HTMLButtonElement).click();
    fixture.detectChanges();
    const postA = http.expectOne(
      (r) => r.method === 'POST' && r.url.includes('/api/venues/1/sets/1/availability'),
    );
    // Tap set 4 (mark) before A settles — POST B in flight.
    (tile(4) as HTMLButtonElement).click();
    fixture.detectChanges();
    const postB = http.expectOne(
      (r) => r.method === 'POST' && r.url.includes('/api/venues/1/sets/4/availability'),
    );

    // A completes and reconciles (a full reload) while B is still outstanding — must NOT wipe set 4's
    // optimistic override + pending flag. Set 4 still reads server-FREE here; its override must win.
    postA.flush(null);
    flushLoad([seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'TAKEN'), ...SEED.slice(1)], BOOKINGS, [
      { setId: 1, state: 'STAFF_MARKED' },
      ...STATES,
    ]);
    expect(tile(4).getAttribute('data-state')).toBe('STAFF_MARKED'); // override preserved
    expect((tile(4) as HTMLButtonElement).disabled).toBe(true); // still pending — no second tap possible

    // B settles → its own reconcile clears set 4; the server now confirms it staff-marked.
    postB.flush(null);
    flushLoad(
      [seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'TAKEN'), SEED[1], SEED[2], seat(4, 'B', 1, 'STANDARD', 'WALK_IN', 'TAKEN')],
      BOOKINGS,
      [{ setId: 1, state: 'STAFF_MARKED' }, ...STATES, { setId: 4, state: 'STAFF_MARKED' }],
    );
    expect(tile(4).getAttribute('data-state')).toBe('STAFF_MARKED');
    expect((tile(4) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does nothing when an online-booked tile is tapped (locked)', () => {
    render();
    tile(2).click(); // it's a span, but click anyway — must not send a write
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'POST' || r.method === 'DELETE');
    expect(tile(2).getAttribute('data-state')).toBe('BOOKED_ONLINE');
  });

  it('lists arrivals with their set label and a display-only booking-code chip (#7)', () => {
    render();
    const rows = host.querySelectorAll('[data-testid="daily-arrival-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('A · 2'); // set 2's position label
    const code = rows[0].querySelector('[data-testid="daily-arrival-code"]')!;
    expect(code.tagName).toBe('CODE'); // display-only, never an input
    expect(code.textContent).toContain('ABC12345');
  });

  it('shows an empty arrivals state when there are no confirmed bookings', () => {
    render(SEED, []);
    expect(byId('daily-arrivals-empty')).toBeTruthy();
    expect(host.querySelectorAll('[data-testid="daily-arrival-row"]')).toHaveLength(0);
  });

  it('defaults the date to today in Europe/Tirane (invariant #6)', () => {
    render();
    expect((byId('daily-date') as HTMLInputElement).value).toBe(todayBookingDate(new Date()));
  });

  it('reloads and clears optimistic overrides when the date changes', () => {
    render();
    const date = byId('daily-date') as HTMLInputElement;
    // Tomorrow in Tirane: never equals the preloaded today, so the reload actually fires.
    date.value = defaultBookingDate(new Date());
    date.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    // A fresh load cycle for the new date; all four sets free that day.
    flushLoad([
      seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'FREE'),
      seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 'FREE'),
      seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'FREE'),
      seat(4, 'B', 1, 'STANDARD', 'WALK_IN', 'FREE'),
    ], [], []);
    expect(tile(2).getAttribute('data-state')).toBe('FREE');
    expect(host.querySelectorAll('[data-testid="daily-arrival-row"]')).toHaveLength(0);
  });

  it('never serves the console snapshot — its reads are excluded from the shared cache (#486 AC-3)', () => {
    // Warm on this tab's own key, yet both flushLoad calls below still demand a real request.
    configure(() => {
      TestBed.inject(ConsoleVenueMap).load(1, todayBookingDate(new Date())).subscribe();
      http
        .expectOne(
          (r) => r.method === 'GET' && r.url.includes('/api/venues/1') && !r.url.includes('/bookings'),
        )
        .flush({ id: 1, name: 'V', sets: SEED });
    });
    flushLoad(); // the tab's own opening (venue, today) read still reaches the server
    host = fixture.nativeElement as HTMLElement;

    (tile(1) as HTMLButtonElement).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/sets/1/availability'))
      .flush(null);
    // ...and so does the reconcile, on the very same key the warm snapshot holds.
    flushLoad([seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'TAKEN'), ...SEED.slice(1)], BOOKINGS, [
      { setId: 1, state: 'STAFF_MARKED' },
      ...STATES,
    ]);

    expect(tile(1).getAttribute('data-state')).toBe('STAFF_MARKED');
  });

  it('shows the not-owner notice when a mark is 403 (invariant #13) and reconciles', () => {
    render();
    (tile(1) as HTMLButtonElement).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/sets/1/availability'))
      .flush({ code: 'NOT_VENUE_OWNER' }, { status: 403, statusText: 'Forbidden' });
    flushLoad(); // the error path reconciles
    expect(byId('daily-notice').textContent?.toLowerCase()).toContain('manage');
  });

  it('surfaces the just-taken notice when a mark returns 409 ALREADY_TAKEN', () => {
    render();
    (tile(1) as HTMLButtonElement).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/sets/1/availability'))
      .flush({ code: 'ALREADY_TAKEN' }, { status: 409, statusText: 'Conflict' });
    flushLoad();
    expect(byId('daily-notice').textContent?.toLowerCase()).toContain('just taken');
  });

  it('surfaces the not-a-walk-in notice when a release returns 409 NOT_MARKED', () => {
    render();
    (tile(3) as HTMLButtonElement).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url.includes('/api/venues/1/sets/3/availability'))
      .flush({ code: 'NOT_MARKED' }, { status: 409, statusText: 'Conflict' });
    flushLoad();
    expect(byId('daily-notice').textContent?.toLowerCase()).toContain('not a walk-in');
  });

  it('drops the session and shows the expiry notice when a mark returns 401', () => {
    render();
    (tile(1) as HTMLButtonElement).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/sets/1/availability'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    flushLoad();
    expect(byId('daily-notice').textContent?.toLowerCase()).toContain('session');
  });

  it('keeps the loading state until ALL reads settle — no "0 of 0 free" flash (#126)', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings'))
      .flush(BOOKINGS);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/availability'))
      .flush(STATES);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    // Bookings + states resolved but the venue read is still in flight — no grid yet.
    expect(host.querySelector('[data-testid="daily-view-tab"]')).toBeNull();

    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/bookings') &&
          !r.url.includes('/availability'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets: SEED });
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="daily-view-tab"]')).toBeTruthy();
  });

  it('shows a load-error (not a false empty state) when the venue read fails', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings'))
      .flush([]);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/availability'))
      .flush([]);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/bookings') &&
          !r.url.includes('/availability'),
      )
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(byId('daily-load-error')).toBeTruthy();
  });

  it('shows a load-error when the states read fails on first load — tiles must never guess (#207)', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings'))
      .flush(BOOKINGS);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/availability'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/bookings') &&
          !r.url.includes('/availability'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets: SEED });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(byId('daily-load-error')).toBeTruthy();
  });

  it('re-loads for the new venue when the parent param changes in place (#180)', () => {
    render();
    expect(tile(3).getAttribute('data-state')).toBe('STAFF_MARKED');

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    // Venue 1's grid, codes and counts must not render against venue 2 while its reads are in flight.
    expect(host.querySelector('[data-set-id]')).toBeNull();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2/bookings'))
      .flush([]);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2/availability'))
      .flush([]);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/2') &&
          !r.url.includes('/bookings') &&
          !r.url.includes('/availability'),
      )
      .flush({
        id: 2,
        name: 'W',
        beach: 'Dhermi',
        region: 'Riviera',
        sets: [seat(9, 'A', 1, 'STANDARD', 'ONLINE', 'FREE')],
      });
    fixture.detectChanges();

    expect(tile(9).getAttribute('data-state')).toBe('FREE');
    expect(host.querySelectorAll('[data-set-id]')).toHaveLength(1);
  });

  it('ignores the old venue’s late reads after a venue switch (#180)', () => {
    configure();
    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2/bookings'))
      .flush([]);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2/availability'))
      .flush([]);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/2') &&
          !r.url.includes('/bookings') &&
          !r.url.includes('/availability'),
      )
      .flush({
        id: 2,
        name: 'W',
        beach: 'Dhermi',
        region: 'Riviera',
        sets: [seat(9, 'A', 1, 'STANDARD', 'ONLINE', 'FREE')],
      });
    // The superseded venue-1 reads resolve late — they must not replace venue 2's grid.
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings'))
      .flush(BOOKINGS);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/availability'))
      .flush(STATES);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/bookings') &&
          !r.url.includes('/availability'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets: SEED });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('[data-set-id]')).toHaveLength(1);
    expect(tile(9).getAttribute('data-state')).toBe('FREE');
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
    gridY: rowLabel === 'A' ? 1 : 2,
    availability,
  };
}
