import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { todayBookingDate } from '../venue/booking-date';
import { Pool, SetView, Tier } from '../venue/venue.model';
import { DailyViewTab } from './daily-view-tab';

/**
 * The O5 Daily view tab (#175). Reads `:venueId` from the PARENT route (child routes don't inherit
 * it — O1 finding), loads the venue map + the day's confirmed bookings, and renders the sea-facing
 * availability grid + the Arrivals list. Drives: the three tile states (FREE / booked-online-locked /
 * staff-marked); tap-to-mark and tap-to-release round-trips with optimistic flip + reconcile; the
 * online-booked lock; the arrivals code chips (display-only, invariant #7); the Tirane default date +
 * reload-on-change; and the mark/release 403/401 failure copy (invariant #13).
 */
describe('DailyViewTab (#175)', () => {
  let fixture: ComponentFixture<DailyViewTab>;
  let http: HttpTestingController;
  let host: HTMLElement;

  // A1 FREE (tap→mark); A2 TAKEN + booked online (locked); A3 TAKEN staff-marked (tap→release);
  // B1 FREE walk-in.
  const SEED: SetView[] = [
    seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'FREE'),
    seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 'TAKEN'),
    seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'TAKEN'),
    seat(4, 'B', 1, 'STANDARD', 'WALK_IN', 'FREE'),
  ];
  const BOOKINGS = [{ setId: 2, code: 'ABC12345' }]; // set 2 is held by a confirmed online booking

  function configure(): void {
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
    // OperatorAuth restores the session on construction — settle it signed-out (the shell gates access).
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
  }

  /** Flush one load cycle: the venue-map GET + the daily-bookings GET (initial load and each reconcile). */
  function flushLoad(sets: SetView[] = SEED, bookings = BOOKINGS): void {
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings'))
      .flush(bookings);
    http
      .expectOne(
        (r) => r.method === 'GET' && r.url.includes('/api/venues/1') && !r.url.includes('/bookings'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets });
    fixture.detectChanges();
  }

  function render(sets: SetView[] = SEED, bookings = BOOKINGS): void {
    configure();
    flushLoad(sets, bookings);
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
    // Reconcile re-reads map + bookings; return set 1 now TAKEN (staff-marked) so it stays marked.
    flushLoad([seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'TAKEN'), ...SEED.slice(1)]);
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
    flushLoad([...SEED.slice(0, 2), seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'FREE'), SEED[3]]);
    expect(tile(3).getAttribute('data-state')).toBe('FREE');
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
    date.value = '2026-08-01';
    date.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    // A fresh load cycle for the new date; all four sets free that day.
    flushLoad([
      seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 'FREE'),
      seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 'FREE'),
      seat(3, 'A', 3, 'PREMIUM', 'ONLINE', 'FREE'),
      seat(4, 'B', 1, 'STANDARD', 'WALK_IN', 'FREE'),
    ], []);
    expect(tile(2).getAttribute('data-state')).toBe('FREE');
    expect(host.querySelectorAll('[data-testid="daily-arrival-row"]')).toHaveLength(0);
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

  it('shows a load-error (not a false empty state) when the venue read fails', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/bookings'))
      .flush([]);
    http
      .expectOne(
        (r) => r.method === 'GET' && r.url.includes('/api/venues/1') && !r.url.includes('/bookings'),
      )
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(byId('daily-load-error')).toBeTruthy();
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
