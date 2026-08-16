import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { expectCellsMatchRailHeight } from '../../testing/beach-map-height';
import { defaultBookingDate, todayBookingDate } from '../shared/booking-date';
import { Pool, SetView, Tier } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { ConsoleDailyBooking } from './operator-console.model';
import { DailyViewTab } from './daily-view-tab';
import { FakeQrScanner } from './fake-qr-scanner';
import { QrScanner } from './qr-scanner';

/**
 * The Daily view tab. Reads `:venueId` from the PARENT route (child routes don't inherit
 * it), loads the venue map + the day's settled bookings, and renders the sea-facing
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
  // set 2 is held by a confirmed online booking
  const BOOKINGS: ConsoleDailyBooking[] = [{ setId: 2, code: 'ABC12345', status: 'CONFIRMED' }];
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
        { provide: QrScanner, useClass: FakeQrScanner },
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

  it('sizes tiles with the rail cells’ fixed --riv-tile height, never aspect-ratio (#683)', () => {
    render();
    expectCellsMatchRailHeight(host, '[data-testid="daily-tile"]');
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
      .expectOne(
        (r) => r.method === 'DELETE' && r.url.includes('/api/venues/1/sets/3/availability'),
      )
      .flush(null);
    expect(tile(3).getAttribute('data-state')).toBe('FREE'); // optimistic release
    flushLoad(
      [...SEED.slice(0, 2), seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'FREE'), SEED[3]],
      BOOKINGS,
      [{ setId: 2, state: 'BOOKED_ONLINE' }],
    );
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
      [
        seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'TAKEN'),
        SEED[1],
        SEED[2],
        seat(4, 'B', 1, 'STANDARD', 'WALK_IN', 'TAKEN'),
      ],
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

  it('renders a no-show arrivals row so a swept past day is not empty', () => {
    render(SEED, [{ setId: 2, code: 'ABC12345', status: 'NO_SHOW' }]);

    const rows = host.querySelectorAll('[data-testid="daily-arrival-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('A \u00b7 2');
    const chip = byId('arrival-no-show');
    expect(chip.textContent).toContain('No-show');
    expect(chip.className).toContain('chip--no-show');
    expect(byId('arrival-checked-in')).toBeNull();
  });

  it('shows no badge on a still-expected CONFIRMED arrival', () => {
    render();

    expect(byId('arrival-no-show')).toBeNull();
    expect(byId('arrival-checked-in')).toBeNull();
    expect(host.querySelectorAll('[data-testid="daily-arrival-row"]')).toHaveLength(1);
  });

  it('checks a typed code in: POST, success notice, then a reconcile shows the checked-in chip (#583)', () => {
    render();
    const input = byId('checkin-code-input') as HTMLInputElement;
    input.value = 'abc-123 45';
    (byId('checkin-submit') as HTMLButtonElement).click();

    const post = http.expectOne(
      (r) => r.method === 'POST' && r.url.includes('/api/venues/1/bookings/ABC12345/check-in'),
    );
    post.flush({ setId: 2, bookingDate: '2026-08-09' });
    fixture.detectChanges();
    expect(byId('checkin-result').textContent).toContain('Checked in');

    flushLoad(SEED, [{ setId: 2, code: 'ABC12345', status: 'COMPLETED' }]);
    expect(byId('arrival-checked-in')).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('explains a second scan distinctly — ALREADY_CHECKED_IN is not a failure to retry (#583)', () => {
    render();
    const input = byId('checkin-code-input') as HTMLInputElement;
    input.value = 'ABC12345';
    (byId('checkin-submit') as HTMLButtonElement).click();

    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/check-in'))
      .flush({ code: 'ALREADY_CHECKED_IN' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(byId('checkin-result').textContent).toContain('Already checked in');
  });

  it('names the booking’s real day on WRONG_SERVICE_DATE, never the code (#583)', () => {
    render();
    const input = byId('checkin-code-input') as HTMLInputElement;
    input.value = 'ABC12345';
    (byId('checkin-submit') as HTMLButtonElement).click();

    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/check-in'))
      .flush(
        { code: 'WRONG_SERVICE_DATE', bookingDate: '2026-08-15' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    const notice = byId('checkin-result').textContent;
    expect(notice).toContain('2026-08-15');
    expect(notice).not.toContain('ABC12345');
  });

  it('rejects a scan payload that is not a booking code without calling the server (#583)', () => {
    render();
    const input = byId('checkin-code-input') as HTMLInputElement;
    input.value = 'https://example.com/not-a-booking';
    (byId('checkin-submit') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(byId('checkin-result').textContent).toContain('doesn’t look like a booking code');
    http.verify();
  });

  it('scans via the armed fake scanner: toggle starts it, a payload checks in, garbage is rejected (#583)', () => {
    (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__ = [
      'not a booking payload!',
      'http://localhost/booking/ABC12345',
    ];
    try {
      render();
      (byId('checkin-scan-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(byId('checkin-result').textContent).toContain('isn’t a booking');

      (byId('checkin-scan-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      http
        .expectOne((r) => r.method === 'POST' && r.url.includes('/bookings/ABC12345/check-in'))
        .flush({ setId: 2, bookingDate: '2026-06-15' });
      fixture.detectChanges();
      expect(byId('checkin-result').textContent).toContain('Checked in');
      flushLoad(SEED, [{ setId: 2, code: 'ABC12345', status: 'COMPLETED' }]);
    } finally {
      delete (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__;
    }
  });

  it('falls back to typing when the camera is unavailable, with the notice explaining it (#583)', async () => {
    render();
    const scanner = TestBed.inject(QrScanner);
    vi.spyOn(scanner, 'start').mockRejectedValue(new Error('NotAllowedError'));

    (byId('checkin-scan-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('checkin-result').textContent).toContain('Camera unavailable');
    expect(byId('checkin-video')).toBeNull();
  });

  it('names the cure when the camera is blocked or absent (Safari guidance) (#583)', async () => {
    render();
    const scanner = TestBed.inject(QrScanner);
    const start = vi.spyOn(scanner, 'start');
    const attempt = async (error: Error) => {
      start.mockRejectedValueOnce(error);
      (byId('checkin-scan-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return byId('checkin-result').textContent;
    };

    expect(await attempt(new DOMException('denied', 'NotAllowedError'))).toContain('blocked');
    expect(await attempt(new DOMException('none', 'NotFoundError'))).toContain('No usable camera');
    expect(await attempt(new DOMException('busy', 'NotReadableError'))).toContain('another app');
    expect(await attempt(new DOMException('nope', 'NotSupportedError'))).toContain(
      'can’t open the camera',
    );
  });

  it('explains every check-in denial in operator terms (#583)', () => {
    render();
    const submit = (status: number, body: object) => {
      const input = byId('checkin-code-input') as HTMLInputElement;
      input.value = 'ABC12345';
      (byId('checkin-submit') as HTMLButtonElement).click();
      http
        .expectOne((r) => r.method === 'POST' && r.url.includes('/check-in'))
        .flush(body, { status, statusText: 'x' });
      fixture.detectChanges();
      return byId('checkin-result').textContent;
    };

    expect(submit(404, { code: 'BOOKING_NOT_FOUND' })).toContain('No booking with that code');
    expect(submit(403, { code: 'NOT_VENUE_OWNER' })).toContain('don’t manage this venue');
    expect(submit(409, { code: 'WRONG_SERVICE_DATE' })).toContain('different day');
    expect(submit(500, { code: 'BOOM' })).toContain('Couldn’t check in');
    expect(submit(401, { code: 'UNAUTHENTICATED' })).toContain('session expired');
  });

  it('starts the scanner only once its video element exists — never with undefined', () => {
    render();
    const scanner = TestBed.inject(QrScanner);
    const start = vi.spyOn(scanner, 'start').mockResolvedValue(undefined);

    (byId('checkin-scan-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toBeInstanceOf(HTMLVideoElement);
  });

  it('closes the scanner when the venue switches in place (camera must not outlive the venue)', () => {
    render();
    const scanner = TestBed.inject(QrScanner);
    const stop = vi.spyOn(scanner, 'stop');
    (byId('checkin-scan-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    expect(stop).toHaveBeenCalled();
    expect(byId('checkin-video')).toBeNull();
    http.expectOne((r) => r.url.includes('/api/venues/2/bookings')).flush([]);
    http.expectOne((r) => r.url.includes('/api/venues/2/availability')).flush([]);
    http
      .expectOne(
        (r) =>
          r.url.includes('/api/venues/2') &&
          !r.url.includes('/bookings') &&
          !r.url.includes('/availability'),
      )
      .flush({ id: 2, name: 'V2', beach: 'B', region: 'R', sets: [] });
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
    flushLoad(
      [
        seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'FREE'),
        seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 'FREE'),
        seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'FREE'),
        seat(4, 'B', 1, 'STANDARD', 'WALK_IN', 'FREE'),
      ],
      [],
      [],
    );
    expect(tile(2).getAttribute('data-state')).toBe('FREE');
    expect(host.querySelectorAll('[data-testid="daily-arrival-row"]')).toHaveLength(0);
  });

  it('never serves the console snapshot — its reads are excluded from the shared cache (#486 AC-3)', () => {
    // Warm on this tab's own key, yet both flushLoad calls below still demand a real request.
    configure(() => {
      TestBed.inject(ConsoleVenueMap).load(1, todayBookingDate(new Date())).subscribe();
      http
        .expectOne(
          (r) =>
            r.method === 'GET' && r.url.includes('/api/venues/1') && !r.url.includes('/bookings'),
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
      .expectOne(
        (r) => r.method === 'DELETE' && r.url.includes('/api/venues/1/sets/3/availability'),
      )
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
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings')).flush([]);
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
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2/bookings')).flush([]);
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

    http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2/bookings')).flush([]);
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
