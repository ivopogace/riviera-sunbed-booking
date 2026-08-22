import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { freezeClock } from '../../testing/freeze-clock';
import { todayBookingDate } from '../shared/booking-date';
import { MoneyView } from '../shared/money';
import { SetView, Tier } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { PendingRequestsStore } from './pending-requests-store';
import { RequestsTab } from './requests-tab';

/**
 * The Requests tab. Reads `:venueId` from the PARENT route (child routes don't inherit it),
 * loads the venue map (labels/tier, best-effort) + the venue-wide pending-request queue,
 * and renders one card per request — guest, set + tier, date, price, "Respond by", and an amber
 * time-left chip when urgent — with NO booking code (invariant #7). Drives: accept → payment (card
 * leaves, badge decrements, never self-confirms — invariant #8); confirm-gated decline; the
 * dismissible expired-race copy on a lost sweep race (409 REQUEST_EXPIRED); the all-caught-up empty
 * state; and the 403/401 owner-assert copy (invariant #13). The shell badge stays in sync via the
 * shared PendingRequestsStore.
 */
describe('RequestsTab (#176)', () => {
  let fixture: ComponentFixture<RequestsTab>;
  let params$: BehaviorSubject<ParamMap>;
  let http: HttpTestingController;
  let host: HTMLElement;
  let store: PendingRequestsStore;

  const EUR = (minorUnits: number): MoneyView => ({ minorUnits, currency: 'EUR' });

  /** ISO instant `hours` from now — for deterministic urgency (component captures Date.now() at load). */
  function inHours(hours: number): string {
    return new Date(Date.now() + hours * 3_600_000).toISOString();
  }

  function request(over: Partial<PendingRequest> = {}): PendingRequest {
    return {
      bookingId: 11,
      setId: 1,
      bookingDate: '2026-07-03',
      guestName: 'Ana Guest',
      amount: EUR(4500),
      requestedAt: '2026-07-01T09:00:00Z',
      requestExpiresAt: inHours(30), // not urgent by default
      ...over,
    };
  }

  const SEED_SETS: SetView[] = [seat(1, 'A', 1, 'PREMIUM'), seat(2, 'B', 2, 'STANDARD')];

  /** `beforeCreate` runs after the injector exists but before the tab mounts — the shell's window. */
  function configure(beforeCreate?: () => void): void {
    params$ = new BehaviorSubject(convertToParamMap({ venueId: '1' }));
    TestBed.configureTestingModule({
      imports: [RequestsTab],
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
    fixture = TestBed.createComponent(RequestsTab);
    store = TestBed.inject(PendingRequestsStore);
    fixture.detectChanges();
    // OperatorAuth restores the session on construction — settle it signed-out (the shell gates access).
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
  }

  /** Flush the load cycle: the venue-map GET (labels) + the pending-requests GET. */
  function flushLoad(requests: PendingRequest[], sets: SetView[] = SEED_SETS): void {
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/booking-requests'))
      .flush(requests);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/booking-requests'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets });
    fixture.detectChanges();
  }

  function render(requests: PendingRequest[], sets: SetView[] = SEED_SETS): void {
    configure();
    flushLoad(requests, sets);
    host = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  it('announces through one region that survives loading → loaded (#741)', () => {
    configure();
    const el = fixture.nativeElement as HTMLElement;
    const announcer = el.querySelector('[data-testid="load-announcer"]')!;
    expect(announcer.textContent?.trim()).toBe('Loading requests…');
    // The visible copy is decoration; the announcer alone carries the words.
    expect(el.querySelector('[data-testid="requests-loading"]')!.getAttribute('aria-hidden')).toBe(
      'true',
    );

    flushLoad([]);

    // Same node, mutated text: the mechanism that makes a live region speak.
    expect(el.querySelector('[data-testid="load-announcer"]')).toBe(announcer);
    expect(announcer.textContent?.trim()).toBe('Requests loaded.');
  });

  it('renders skeleton request cards while the read is in flight (#744)', () => {
    configure();
    const el = fixture.nativeElement as HTMLElement;

    const loading = el.querySelector('[data-testid="requests-loading"]')!;
    expect(loading.querySelectorAll('[data-testid="request-skeleton-card"]').length).toBe(3);
    // The sentence the skeleton replaces; a mirrored shape says it without a reflow (#744).
    expect(loading.textContent).not.toContain('Loading requests');

    flushLoad([]);

    expect(el.querySelector('[data-testid="requests-loading"]')).toBeNull();
    expect(el.querySelector('[data-testid="request-skeleton-card"]')).toBeNull();
  });

  it('the requests skeleton is decorative and motion-reduce safe (#744)', () => {
    configure();
    const el = fixture.nativeElement as HTMLElement;

    const loading = el.querySelector('[data-testid="requests-loading"]')!;
    expect(loading.getAttribute('aria-hidden')).toBe('true');
    expect(loading.getAttribute('aria-live')).toBeNull();
    expect(loading.querySelector('[tabindex]')).toBeNull();
    expect(loading.hasAttribute('inert')).toBe(true);

    const blocks = loading.querySelectorAll('.animate-pulse');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.classList.contains('motion-reduce:animate-none')).toBe(true);
    }

    flushLoad([]);
  });

  function byId(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }
  function cards(): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-testid="request-card"]'));
  }
  function button(name: RegExp): HTMLButtonElement {
    return Array.from(host.querySelectorAll('button')).find((b) =>
      name.test((b.textContent ?? '').trim()),
    )!;
  }

  /** Flush the queue re-read a post-action (or poll) reconcile fires, with the fresh server queue. */
  function flushReconcile(queue: PendingRequest[]): void {
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/booking-requests'))
      .flush(queue);
    fixture.detectChanges();
  }

  it('lists each pending request with guest, set + tier, date, price and respond-by — and no code (#7)', () => {
    render([request({ requestExpiresAt: inHours(30) })]);
    expect(cards()).toHaveLength(1);
    const text = cards()[0].textContent ?? '';
    expect(text).toContain('Ana Guest');
    expect(text).toContain('A · 1'); // set label from the map
    expect(text).toContain('Front row'); // PREMIUM tier name
    expect(text).toContain('Fri 3 Jul 2026'); // formatCivilDate(bookingDate)
    expect(text).toContain('€45');
    expect(text).toContain('Respond by');
    // No booking code anywhere in the queue — the queue is deliberately code-less.
    expect(host.querySelector('[data-testid="requests-tab"] code')).toBeNull();
  });

  it('shows the amber time-left chip only when the deadline is within the urgency window', () => {
    render([
      request({ bookingId: 11, requestExpiresAt: inHours(3) }), // urgent
      request({ bookingId: 12, setId: 2, requestExpiresAt: inHours(30) }), // not urgent
    ]);
    const [urgentCard, calmCard] = cards();
    expect(urgentCard.querySelector('[data-testid="urgency-chip"]')?.textContent).toContain('left');
    expect(calmCard.querySelector('[data-testid="urgency-chip"]')).toBeNull();
  });

  it('accept sends to payment: POSTs accept, removes the card, and decrements the badge (#8)', () => {
    render([request({ bookingId: 11 }), request({ bookingId: 12, setId: 2 })]);
    expect(store.count()).toBe(2);

    button(/Accept/).click();
    fixture.detectChanges();
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/booking-requests/11/accept'),
    );
    expect(req.request.body).toEqual({});
    req.flush({ bookingId: 11, status: 'AWAITING_PAYMENT' });
    fixture.detectChanges();
    // The action reconciles: re-read the queue (server truth = the one remaining request).
    flushReconcile([request({ bookingId: 12, setId: 2 })]);

    expect(cards()).toHaveLength(1);
    expect(store.count()).toBe(1);
    expect(byId('requests-notice')?.textContent?.toLowerCase()).toContain('asked to pay');
  });

  it('reconciles the whole queue after an action, dropping a card the sweep expired meanwhile', () => {
    render([request({ bookingId: 11 }), request({ bookingId: 12, setId: 2 })]);
    button(/Accept/).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/booking-requests/11/accept'))
      .flush({ bookingId: 11, status: 'AWAITING_PAYMENT' });
    fixture.detectChanges();
    // The reconcile re-reads the queue; the sweep expired request 12 too → server returns [].
    flushReconcile([]);
    expect(cards()).toHaveLength(0);
    expect(store.count()).toBe(0);
  });

  it('polls the queue on the interval, dropping a swept card without any operator action', () => {
    vi.useFakeTimers();
    try {
      render([request({ bookingId: 11 }), request({ bookingId: 12, setId: 2 })]);
      expect(cards()).toHaveLength(2);
      // 60s later the poll fires a reconcile; request 12 expired server-side meanwhile.
      vi.advanceTimersByTime(60_000);
      flushReconcile([request({ bookingId: 11 })]);
      expect(cards()).toHaveLength(1);
      expect(store.count()).toBe(1);
    } finally {
      freezeClock();
    }
  });

  it('decline is confirm-gated: Decline opens the confirm (no POST); Confirm decline round-trips', () => {
    render([request({ bookingId: 11 })]);

    button(/^Decline$/).click();
    fixture.detectChanges();
    expect(byId('decline-confirm')?.textContent).toContain('won’t be charged');
    http.expectNone((r) => r.method === 'POST'); // opening the confirm sends nothing

    button(/Confirm decline/).click();
    fixture.detectChanges();
    http
      .expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/booking-requests/11/decline'),
      )
      .flush({ bookingId: 11, status: 'DECLINED' });
    fixture.detectChanges();
    flushReconcile([]); // the post-decline reconcile re-reads the now-empty queue
    expect(cards()).toHaveLength(0);
    expect(store.count()).toBe(0);
    expect(byId('requests-notice')?.textContent?.toLowerCase()).toContain('declined');
  });

  it('“Keep it” cancels the decline confirm without a call', () => {
    render([request({ bookingId: 11 })]);
    button(/^Decline$/).click();
    fixture.detectChanges();
    button(/Keep it/).click();
    fixture.detectChanges();
    expect(byId('decline-confirm')).toBeNull();
    expect(cards()).toHaveLength(1);
    http.expectNone((r) => r.method === 'POST');
  });

  it('shows the dismissible expired-race copy when a decision loses the sweep race (409 REQUEST_EXPIRED)', () => {
    render([request({ bookingId: 11 })]);
    button(/Accept/).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/booking-requests/11/accept'))
      .flush({ code: 'REQUEST_EXPIRED' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    // The card flips in place to the expired copy; the accept/decline buttons are gone (no double-action).
    expect(byId('expired-race')?.textContent).toContain('just expired');
    expect(button(/Accept/)).toBeUndefined();
    expect(cards()).toHaveLength(1);

    // Dismiss removes the card and re-syncs the badge.
    byId('dismiss-expired')!.click();
    fixture.detectChanges();
    expect(cards()).toHaveLength(0);
    expect(store.count()).toBe(0);
  });

  it('drops a stale request (409 REQUEST_NOT_PENDING) with a notice — no expired card', () => {
    render([request({ bookingId: 11 })]);
    button(/Accept/).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/booking-requests/11/accept'))
      .flush({ code: 'REQUEST_NOT_PENDING' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    flushReconcile([]); // the already-handled path also reconciles the rest of the queue
    expect(byId('expired-race')).toBeNull();
    expect(cards()).toHaveLength(0);
    expect(byId('requests-notice')?.textContent?.toLowerCase()).toContain('already handled');
  });

  it('renders the all-caught-up empty state and a 0 badge when the queue is empty', () => {
    render([]);
    expect(byId('requests-empty')?.textContent).toContain('All caught up');
    expect(cards()).toHaveLength(0);
    expect(store.count()).toBe(0);
  });

  it('shows the not-owner notice when an accept is 403 (invariant #13), keeping the card', () => {
    render([request({ bookingId: 11 })]);
    button(/Accept/).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/booking-requests/11/accept'))
      .flush({ code: 'NOT_VENUE_OWNER' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(byId('requests-notice')?.textContent?.toLowerCase()).toContain('manage');
    expect(cards()).toHaveLength(1); // still there to retry
  });

  it('drops the session and shows the expiry notice when an accept returns 401', () => {
    render([request({ bookingId: 11 })]);
    button(/Accept/).click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/booking-requests/11/accept'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(byId('requests-notice')?.textContent?.toLowerCase()).toContain('session');
  });

  it('shows a load-error (not a false empty state) when the queue read fails', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/booking-requests'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/booking-requests'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets: SEED_SETS });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(byId('requests-load-error')).toBeTruthy();
    expect(byId('requests-empty')).toBeNull();
  });

  it('reuses the shell snapshot instead of re-fetching the venue map (#486)', () => {
    // The shell warms (venue, today) first; flushLoad's expectOne throws on a second identical GET.
    let shellSnapshot: SetView[] | undefined;
    configure(() => {
      TestBed.inject(ConsoleVenueMap)
        .load(1, todayBookingDate(new Date()))
        .subscribe((venue) => (shellSnapshot = [...venue.sets]));
    });
    flushLoad([request()]);
    host = fixture.nativeElement as HTMLElement;

    expect(shellSnapshot).toHaveLength(2); // the shell's subscriber was served by the shared read
    // ...and the tab labelled its card from that same snapshot, not the "Set {id}" degraded fallback.
    expect(cards()[0].textContent).toContain('A · 1');
  });

  it('still degrades to the Set-{id} fallback when the shared map read fails (#486 AC-5)', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/booking-requests'))
      .flush([request()]);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/booking-requests'),
      )
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(cards()[0].textContent).toContain('Set 1');
    expect(byId('requests-load-error')).toBeNull(); // the map is best-effort; the queue still rendered
  });

  it('re-loads for the new venue when the parent param changes in place (#180)', () => {
    render([request()]);
    expect(cards()).toHaveLength(1);
    expect(store.count()).toBe(1);

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    // Venue 1's queue must not render (or keep the badge) against venue 2 while its reads run.
    expect(cards()).toHaveLength(0);
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/2/booking-requests'))
      .flush([request({ bookingId: 21 }), request({ bookingId: 22, setId: 2 })]);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/2') &&
          !r.url.includes('/booking-requests'),
      )
      .flush({ id: 2, name: 'W', beach: 'Dhermi', region: 'Riviera', sets: SEED_SETS });
    fixture.detectChanges();

    expect(cards()).toHaveLength(2);
    expect(store.count()).toBe(2);
  });

  it('ignores the old venue’s late queue response after a venue switch (#180)', () => {
    configure();
    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/2/booking-requests'))
      .flush([request({ bookingId: 21 })]);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/2') &&
          !r.url.includes('/booking-requests'),
      )
      .flush({ id: 2, name: 'W', beach: 'Dhermi', region: 'Riviera', sets: SEED_SETS });
    // The superseded venue-1 reads resolve late — they must not replace venue 2's queue or badge.
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/booking-requests'))
      .flush([request({ bookingId: 11 }), request({ bookingId: 12, setId: 2 })]);
    http
      .expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.includes('/api/venues/1') &&
          !r.url.includes('/booking-requests'),
      )
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets: SEED_SETS });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(cards()).toHaveLength(1);
    expect(store.count()).toBe(1);
  });
});

/** A pending Request-to-Book entry as the operator queue endpoint returns it (no booking code, #7). */
interface PendingRequest {
  bookingId: number;
  setId: number;
  bookingDate: string;
  guestName: string;
  amount: MoneyView;
  requestedAt: string;
  requestExpiresAt: string;
}

function seat(id: number, rowLabel: string, positionNo: number, tier: Tier): SetView {
  return {
    id,
    rowLabel,
    positionNo,
    tier,
    pool: 'ONLINE',
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability: 'FREE',
  };
}
