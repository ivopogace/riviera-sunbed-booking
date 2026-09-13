import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { TouchTarget } from '../shared/touch-target';
import { OperatorAuth, SESSION_EXPIRED_MESSAGE } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { LoadAnnouncer } from '../shared/load-announcer';
import { SkeletonBlock } from '../shared/skeleton-block';
import { formatDeadline, isUrgent, timeLeftLabel } from '../shared/deadline';
import { focusMover } from '../shared/focus-after-render';
import { formatMoney } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { formatCivilDate, todayBookingDate } from '../shared/booking-date';
import { setLabel, setsById, tierLabel } from '../shared/set-label';
import { VenueMapView } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { PendingRequestItem, RequestErrorCode } from './operator-console.model';
import { OperatorConsoleService, requestErrorOf } from './operator-console.service';
import { PendingRequestsStore } from './pending-requests-store';

/** One pending-request card's static display fields; the transient accept/decline/expired state is per-id. */
interface RequestRow {
  readonly bookingId: number;
  readonly guest: string;
  readonly setLabel: string;
  readonly tierName: string;
  readonly dateLabel: string;
  readonly priceStr: string;
  readonly respondByStr: string;
  readonly urgent: boolean;
  readonly timeLeft: string;
}

/**
 * The Requests tab — the operator console's restyle of the
 * Request-to-Book pending queue. One card per open request (guest, set + tier, date, price, "Respond
 * by", and an amber ⏰ time-left chip when urgent), a one-click **Accept — send to payment**, a
 * confirm-gated **Decline**, a dismissible **expired-race** notice when the sweep wins the race, and
 * an **all-caught-up** empty state.
 *
 * <p><strong>Restyle only — no request-lifecycle change.</strong> The response deadline, the
 * expiry sweep and the pay window are server-owned; accept only moves the guest into the pay window,
 * and CONFIRMED comes solely from the signature-verified Stripe webhook, never from this tab
 * (invariant #8). The queue is deliberately <strong>code-less</strong>: a pending request isn't
 * confirmed and the booking code is the guest's bearer credential, shown to staff only at arrival
 * (invariant #7). Every accept/decline is owner-asserted server-side (invariant #13); a 403/401 maps
 * to operator copy. Reads `:venueId` from the parent route via {@link parentVenueId} (child routes
 * don't inherit it), like the sibling console tabs. Always porcelain (inherited from
 * the console shell); cards via {@link CardGlass}. The shell's Requests badge stays in sync through the
 * shared {@link PendingRequestsStore}, which this tab writes after load and every action.
 *
 * <p>The queue is <strong>reconciled with server truth</strong> — re-read after every accept/decline
 * and on a low-frequency poll — so a request the expiry sweep expires (or another operator device handles)
 * leaves the list rather than lingering as a phantom card, and the urgency clock stays current on this
 * long-open working surface. The reconcile is read-only; it changes no request-lifecycle state.
 */
@Component({
  selector: 'app-requests-tab',
  imports: [CardGlass, LoadAnnouncer, SkeletonBlock, BusyAction, TouchTarget],
  templateUrl: './requests-tab.html',
})
export class RequestsTab {
  private readonly route = inject(ActivatedRoute);
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly console = inject(OperatorConsoleService);
  private readonly badge = inject(PendingRequestsStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  protected readonly operator = inject(OperatorAuth);

  /** Every decision here destroys the control that was just activated (WCAG 2.4.3) — the card leaves
   *  the queue, or the confirm panel it sat in is torn down. */
  private readonly focusAfterRender = focusMover();

  /** The venue this tab manages, from the parent `/operator/:venueId` route (undefined if
   *  invalid) — reactive to in-place venue switches, which reuse this instance. */
  private readonly venueId = parentVenueId(this.route);

  /** The venue map, loaded best-effort for set labels + tiers (undefined until/if it loads). */
  private readonly venue = signal<VenueMapView | undefined>(undefined);
  /** The venue-wide pending-request queue (all dates), sorted server-side by response deadline. */
  private readonly requests = signal<readonly PendingRequestItem[]>([]);
  /** True once the queue read settles (success or failure) — drives loading vs content. */
  protected readonly loaded = signal(false);
  /** True when the queue read failed — shows an error, not a false empty state. */
  protected readonly loadError = signal(false);
  /** A transient action notice (accept/decline outcome, or a non-race failure). */
  protected readonly notice = signal<string | undefined>(undefined);

  /** The in-flight skeleton's placeholder cards — a queue long enough to read as a list (#744). */
  protected readonly skeletonCards = [1, 2, 3] as const;

  /** "Now" for the urgency window — refreshed at load, on every reconcile, and on the poll (never an
   *  ambient clock in the template) so the amber chips don't freeze on this long-open surface. */
  private readonly nowMs = signal(0);

  /** Requests with an in-flight accept/decline — their buttons are disabled until it settles. */
  private readonly deciding = signal<ReadonlySet<number>>(new Set());
  /** Requests showing the inline "Decline this request?" confirm. */
  private readonly declineConfirm = signal<ReadonlySet<number>>(new Set());
  /** Requests the sweep expired mid-action — the dismissible expired-race card. */
  private readonly expired = signal<ReadonlySet<number>>(new Set());
  /** Bumped per venue context: an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead. */
  private epoch = 0;

  constructor() {
    // Re-runs on an in-place venue switch: reset to the fresh-mount state, then load.
    effect(() => {
      const id = this.venueId();
      untracked(() => (id === undefined ? this.markInvalid() : this.resetForVenue()));
    });
    // One lifetime poll: the expiry sweep + urgency clock reconcile whatever venue is current.
    const poll = setInterval(() => this.reconcile(), REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(poll));
  }

  private markInvalid(): void {
    this.loaded.set(true);
    this.loadError.set(true);
  }

  /**
   * Drop every venue-scoped signal — queue, notice, transient card state — and load fresh.
   *
   * <p>A decline confirm is the one piece of that teardown which can be holding focus, so the
   * switch moves focus off it first (WCAG 2.4.3), as `payouts-tab` does for its statement.
   */
  private resetForVenue(): void {
    if (this.declineConfirm().size > 0) {
      this.focusAfterRender(TAB);
    }
    this.epoch++;
    this.venue.set(undefined);
    this.requests.set([]);
    this.loaded.set(false);
    this.loadError.set(false);
    this.notice.set(undefined);
    this.deciding.set(new Set());
    this.declineConfirm.set(new Set());
    this.expired.set(new Set());
    this.load();
  }

  /** The pending-request rows, each resolved to a set label + tier from the loaded map (else the raw id). */
  protected readonly rows = computed<readonly RequestRow[]>(() => {
    const byId = setsById(this.venue()?.sets);
    const now = this.nowMs();
    return this.requests().map((r) => {
      const set = byId.get(r.setId);
      return {
        bookingId: r.bookingId,
        guest: r.guestName,
        setLabel: setLabel(byId, r.setId),
        tierName: tierLabel(set?.tier ?? 'STANDARD'),
        dateLabel: formatCivilDate(r.bookingDate),
        priceStr: formatMoney(r.amount),
        respondByStr: formatDeadline(r.requestExpiresAt),
        urgent: isUrgent(r.requestExpiresAt, now),
        timeLeft: timeLeftLabel(r.requestExpiresAt, now),
      };
    });
  });

  protected isDeciding(bookingId: number): boolean {
    return this.deciding().has(bookingId);
  }
  protected inDecline(bookingId: number): boolean {
    return this.declineConfirm().has(bookingId);
  }
  protected isExpired(bookingId: number): boolean {
    return this.expired().has(bookingId);
  }

  protected onAccept(row: RequestRow): void {
    this.decide(row.bookingId, 'accept');
  }

  /** Open the inline decline confirm (a two-step decline — no accidental cancellations). The confirm
   *  replaces the Decline button that opened it, so focus follows onto the destructive button. */
  protected onDecline(row: RequestRow): void {
    this.notice.set(undefined);
    this.declineConfirm.update((s) => new Set(s).add(row.bookingId));
    this.focusAfterRender(confirmDeclineTestId(row.bookingId));
  }

  protected onConfirmDecline(row: RequestRow): void {
    this.decide(row.bookingId, 'decline');
  }

  /** Back out of the confirm — focus returns to the Decline trigger the confirm replaced. */
  protected onCancelDecline(row: RequestRow): void {
    this.declineConfirm.update((s) => without(s, row.bookingId));
    this.focusAfterRender(declineTestId(row.bookingId));
  }

  /** Dismiss an expired-race card: drop it from the queue and re-sync the badge. Dismiss sets no
   *  notice, so the empty region would be a silent landing — the all-caught-up panel speaks instead. */
  protected onDismissExpired(row: RequestRow): void {
    this.expired.update((s) => without(s, row.bookingId));
    const landing = this.landingAfterRemoving(row.bookingId, EMPTY);
    this.removeCard(row.bookingId);
    this.focusAfterRender(landing, EMPTY);
  }

  /**
   * Send the accept or decline and settle the card on the answer.
   *
   * <p>The decline confirm stays up for the whole round trip, and closes only when this settles:
   * tearing it down here would destroy the button just pressed and strand focus (WCAG 2.4.3) for
   * the entire in-flight window, and it is what makes the panel's own `[appBusy]` meaningful.
   */
  private decide(bookingId: number, action: 'accept' | 'decline'): void {
    const venueId = this.venueId();
    if (venueId === undefined || this.isDeciding(bookingId)) {
      return;
    }
    const epoch = this.epoch;
    this.notice.set(undefined);
    this.deciding.update((s) => new Set(s).add(bookingId));
    const call =
      action === 'accept'
        ? this.console.acceptRequest(venueId, bookingId)
        : this.console.declineRequest(venueId, bookingId);
    call.subscribe({
      next: (decision) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this decision's UI state (#180)
        }
        this.stopDeciding(bookingId);
        this.closeDeclineConfirm(bookingId);
        this.notice.set(decisionNotice(action, decision.status));
        // Read the landing spot BEFORE the queue loses the card, or the neighbour is off by one.
        const landing = this.landingAfterRemoving(bookingId, NOTICE);
        this.removeCard(bookingId); // instant optimistic removal…
        this.focusAfterRender(landing, NOTICE);
        this.reconcile(); // …then re-sync the rest of the queue with server truth
      },
      error: (e: unknown) => {
        if (this.epoch === epoch) {
          this.onDecisionError(bookingId, action, e); // skip if a venue switch superseded it (#180)
        }
      },
    });
  }

  /** Route an accept/decline failure: the sweep race → the in-card expired copy; stale → drop; else a notice. */
  private onDecisionError(bookingId: number, action: 'accept' | 'decline', e: unknown): void {
    this.stopDeciding(bookingId);
    const reason = requestErrorOf(e);
    switch (reason) {
      case 'REQUEST_EXPIRED': {
        // Keep the card, flipped to the dismissible expired-race copy — do NOT reconcile it away.
        this.closeDeclineConfirm(bookingId);
        this.expired.update((s) => new Set(s).add(bookingId));
        this.focusAfterRender(expiredRaceTestId(bookingId), NOTICE);
        break;
      }
      case 'REQUEST_NOT_PENDING':
      case 'NO_SUCH_REQUEST': {
        this.closeDeclineConfirm(bookingId);
        this.notice.set('That request was already handled — the queue has moved on.');
        const landing = this.landingAfterRemoving(bookingId, NOTICE);
        this.removeCard(bookingId);
        this.focusAfterRender(landing, NOTICE);
        this.reconcile(); // other cards may be stale too
        break;
      }
      case 'UNAUTHORIZED':
        this.closeDeclineConfirm(bookingId);
        this.notice.set(SESSION_EXPIRED_MESSAGE);
        this.operator.sessionLost();
        this.focusAfterRender(NOTICE);
        break;
      default:
        // Destroys nothing, so nothing moves: the pressed button still holds focus, and holds the retry.
        this.notice.set(decisionFailureNotice(action, reason));
        break;
    }
  }

  private closeDeclineConfirm(bookingId: number): void {
    this.declineConfirm.update((s) => without(s, bookingId));
  }

  /**
   * The test id focus should land on once `bookingId` leaves the queue: the card below it, else the
   * card above it, else `whenEmpty` — the queue is about to hold nothing to land on.
   *
   * <p>The neighbour rather than the notice at the top of the tab: this is a working queue an
   * operator walks down, and angular.dev's a11y guidance is that the landing spot should leave the
   * user able to move straight back into the content. The card's row, not its Accept button —
   * Accept is a one-click, no-confirm money action.
   */
  private landingAfterRemoving(bookingId: number, whenEmpty: string): string {
    const queue = this.requests();
    const gone = queue.findIndex((r) => r.bookingId === bookingId);
    const neighbour = gone < 0 ? undefined : (queue[gone + 1] ?? queue[gone - 1]);
    return neighbour === undefined ? whenEmpty : rowTestId(neighbour.bookingId);
  }

  private stopDeciding(bookingId: number): void {
    this.deciding.update((s) => without(s, bookingId));
  }

  /** Drop a card from the queue and re-sync the shell badge to the new pending count. */
  private removeCard(bookingId: number): void {
    this.requests.update((list) => list.filter((r) => r.bookingId !== bookingId));
    this.badge.set(this.requests().length);
  }

  private load(): void {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    this.refreshNow();
    const epoch = this.epoch;
    // Best-effort labels/tiers, read once per venue — a failure degrades to "Set {id}".
    this.venueMap.load(venueId, todayBookingDate(new Date())).subscribe({
      next: (v) => {
        if (this.epoch === epoch) {
          this.venue.set(v); // a superseded venue's labels never dress the new venue's queue (#180)
        }
      },
      error: () => {
        /* labels degrade gracefully; the queue read owns the error/loaded state */
      },
    });
    this.fetchQueue(true);
  }

  /** Re-read the queue + refresh the urgency clock — after every action and on the poll — so the list
   *  and the amber chips reflect server truth, not the load-time snapshot. Read-only, no lifecycle change. */
  private reconcile(): void {
    this.refreshNow();
    this.fetchQueue(false);
  }

  private refreshNow(): void {
    this.nowMs.set(Date.now());
  }

  /**
   * Fetch the pending queue and re-sync the badge. `initial` distinguishes the first load (which owns
   * the loading/error state) from a reconcile/poll (a transient blip there must NOT wipe the working
   * queue or flash the error card — only surface a lost session).
   */
  private fetchQueue(initial: boolean): void {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    const epoch = this.epoch;
    this.console.pendingRequests(venueId).subscribe({
      next: (r) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this read — never seed the new venue's queue/badge (#180)
        }
        const landing = this.landingIfFocusLeaves(r);
        this.requests.set(r);
        this.badge.set(r.length);
        this.pruneTransient(r);
        if (landing !== undefined) {
          this.focusAfterRender(landing, TAB);
        }
        if (initial) {
          this.loaded.set(true);
        }
      },
      error: (e: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this read (#180)
        }
        if (initial) {
          this.loadError.set(true);
          this.loaded.set(true);
        }
        if (e instanceof HttpErrorResponse && e.status === 401) {
          this.notice.set(SESSION_EXPIRED_MESSAGE);
          this.operator.sessionLost();
        }
      },
    });
  }

  /**
   * Where focus has to go when a read is about to drop the row it is sitting in, or undefined when
   * it is not sitting in one that leaves.
   *
   * <p>The decision legs cover rows the operator removed. This covers the ones nobody here removed:
   * the queue is re-read on a 60s poll and after every action, so the expiry sweep or another
   * operator's device can take the row focus is in, with no local action behind it. `@for` tracks
   * by booking id, so a row that survives the read keeps its node and its focus — only a row that
   * leaves strands it (WCAG 2.4.3). Lands on the nearest row that survives, else the empty state.
   */
  private landingIfFocusLeaves(fresh: readonly PendingRequestItem[]): string | undefined {
    const focused = this.focusedRow();
    const survives = (id: number): boolean => fresh.some((r) => r.bookingId === id);
    if (focused === undefined || survives(focused)) {
      return undefined;
    }
    const queue = this.requests();
    const gone = queue.findIndex((r) => r.bookingId === focused);
    const below = queue.slice(gone + 1).find((r) => survives(r.bookingId));
    const above = queue
      .slice(0, gone)
      .reverse()
      .find((r) => survives(r.bookingId));
    const neighbour = below ?? above;
    return neighbour === undefined ? EMPTY : rowTestId(neighbour.bookingId);
  }

  /** The booking id of the queue row keyboard focus is inside, if it is inside one at all. */
  private focusedRow(): number | undefined {
    const active = this.document.activeElement;
    const row = active?.closest<HTMLElement>(`[data-testid^="${ROW_PREFIX}"]`);
    const id = Number(row?.dataset['testid']?.slice(ROW_PREFIX.length));
    return row == null || Number.isNaN(id) ? undefined : id;
  }

  /** Drop stale ids from the transient sets once their card leaves the freshly-read queue (e.g. a poll
   *  removed a sweep-expired request), so the sets don't accumulate over a long-open session. */
  private pruneTransient(fresh: readonly PendingRequestItem[]): void {
    const ids = new Set(fresh.map((r) => r.bookingId));
    const keep = (s: ReadonlySet<number>): ReadonlySet<number> =>
      new Set([...s].filter((id) => ids.has(id)));
    this.deciding.update(keep);
    this.declineConfirm.update(keep);
    this.expired.update(keep);
  }

  // The accessible names lead with the button's visible text (WCAG 2.5.3 Label in Name) and add the
  // guest + set to disambiguate the repeated per-card buttons for a screen-reader.
  protected acceptLabel(row: RequestRow): string {
    return `Accept — send to payment: request from ${row.guest} for ${row.setLabel} on ${row.dateLabel}`;
  }
  protected declineLabel(row: RequestRow): string {
    return `Decline: request from ${row.guest} for ${row.setLabel} on ${row.dateLabel}`;
  }
  protected confirmDeclineLabel(row: RequestRow): string {
    return `Confirm decline: request from ${row.guest} for ${row.setLabel}`;
  }
}

/** How often the open Requests tab re-reads the queue + refreshes the urgency clock (60s). */
const REFRESH_MS = 60_000;

/** The hoisted outcome region — it carries the words for every leg that settles a decision. */
const NOTICE = 'requests-notice';
/** The all-caught-up panel — the fallback for the one leg that settles without writing a notice. */
const EMPTY = 'requests-empty';
/** The tab itself — where focus goes when a venue switch takes the whole surface with it. */
const TAB = 'requests-tab';

/**
 * The per-card focus targets. Each carries the booking id because {@link focusMover} resolves by
 * `querySelector`, which takes the first match — a queue-wide id would focus the wrong card.
 */
function rowTestId(bookingId: number): string {
  return `${ROW_PREFIX}${bookingId}`;
}
const ROW_PREFIX = 'request-row-';
function expiredRaceTestId(bookingId: number): string {
  return `expired-race-${bookingId}`;
}
function declineTestId(bookingId: number): string {
  return `request-decline-${bookingId}`;
}
function confirmDeclineTestId(bookingId: number): string {
  return `request-confirm-decline-${bookingId}`;
}

/** A new set with `id` removed (signals are replaced, never mutated). */
function without(set: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

/** The operator-facing notice for a successful accept/decline. */
function decisionNotice(action: 'accept' | 'decline', status: string): string {
  if (action === 'decline') {
    return 'Request declined — the guest was notified. No charge was made.';
  }
  // Accept never confirms the booking here (invariant #8) — it moves the guest into the pay window;
  // a CONFIRMED status only appears with the stub payment profile.
  return status === 'CONFIRMED'
    ? 'Request accepted — the booking is confirmed.'
    : 'Request accepted — the guest has been asked to pay.';
}

/** Map an accept/decline failure (excluding the race / stale / 401 cases handled inline) to operator copy. */
function decisionFailureNotice(action: 'accept' | 'decline', reason: RequestErrorCode): string {
  switch (reason) {
    case 'PAYMENT_INIT_FAILED':
      return 'Could not set up the guest’s payment — please try accepting again.';
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue, so you can’t handle its requests.';
    default:
      return `Could not ${action} that request. Please try again.`;
  }
}
