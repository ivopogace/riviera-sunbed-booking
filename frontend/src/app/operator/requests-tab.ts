import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { OperatorAuth, SESSION_EXPIRED_MESSAGE } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { formatDeadline, isUrgent, timeLeftLabel } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { formatCivilDate, todayBookingDate } from '../venue/booking-date';
import { SetView, VenueMapView } from '../venue/venue.model';
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
 * The O6 Requests tab (issue #176, epic #141) — the operator console's restyle of the #98
 * Request-to-Book pending queue. One card per open request (guest, set + tier, date, price, "Respond
 * by", and an amber ⏰ time-left chip when urgent), a one-click **Accept — send to payment**, a
 * confirm-gated **Decline**, a dismissible **expired-race** notice when the sweep wins the race, and
 * an **all-caught-up** empty state.
 *
 * <p><strong>Restyle only — no request-lifecycle change.</strong> The response deadline, the #98
 * expiry sweep and the pay window are server-owned; accept only moves the guest into the pay window,
 * and CONFIRMED comes solely from the signature-verified Stripe webhook, never from this tab
 * (invariant #8). The queue is deliberately <strong>code-less</strong>: a pending request isn't
 * confirmed and the booking code is the guest's bearer credential, shown to staff only at arrival
 * (invariant #7). Every accept/decline is owner-asserted server-side (invariant #13); a 403/401 maps
 * to operator copy. Reads `:venueId` from the parent route via {@link parentVenueId} (child routes
 * don't inherit it — the O1 finding), like the sibling console tabs. Always porcelain (inherited from
 * the console shell); cards via {@link CardGlass}. The shell's Requests badge stays in sync through the
 * shared {@link PendingRequestsStore}, which this tab writes after load and every action.
 *
 * <p>The queue is <strong>reconciled with server truth</strong> — re-read after every accept/decline
 * and on a low-frequency poll — so a request the #98 sweep expires (or another operator device handles)
 * leaves the list rather than lingering as a phantom card, and the urgency clock stays current on this
 * long-open working surface. The reconcile is read-only; it changes no request-lifecycle state.
 */
@Component({
  selector: 'app-requests-tab',
  imports: [CardGlass],
  templateUrl: './requests-tab.html',
})
export class RequestsTab {
  private readonly route = inject(ActivatedRoute);
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly console = inject(OperatorConsoleService);
  private readonly badge = inject(PendingRequestsStore);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly operator = inject(OperatorAuth);

  private readonly venueId: number | undefined;

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

  /** "Now" for the urgency window — refreshed at load, on every reconcile, and on the poll (never an
   *  ambient clock in the template) so the amber chips don't freeze on this long-open surface. */
  private readonly nowMs = signal(0);

  /** Requests with an in-flight accept/decline — their buttons are disabled until it settles. */
  private readonly deciding = signal<ReadonlySet<number>>(new Set());
  /** Requests showing the inline "Decline this request?" confirm. */
  private readonly declineConfirm = signal<ReadonlySet<number>>(new Set());
  /** Requests the sweep expired mid-action — the dismissible expired-race card. */
  private readonly expired = signal<ReadonlySet<number>>(new Set());

  constructor() {
    const id = parentVenueId(this.route);
    if (id !== undefined) {
      this.venueId = id;
      this.load();
      // Poll so a request the #98 sweep expires (or another operator device handles) leaves the list,
      // and the urgency clock stays current, without the operator refreshing this long-open surface.
      const poll = setInterval(() => this.reconcile(), REFRESH_MS);
      this.destroyRef.onDestroy(() => clearInterval(poll));
    } else {
      this.loaded.set(true);
      this.loadError.set(true);
    }
  }

  /** The pending-request rows, each resolved to a set label + tier from the loaded map (else the raw id). */
  protected readonly rows = computed<readonly RequestRow[]>(() => {
    const byId = new Map(this.venue()?.sets.map((s) => [s.id, s]) ?? []);
    const now = this.nowMs();
    return this.requests().map((r) => {
      const set = byId.get(r.setId);
      return {
        bookingId: r.bookingId,
        guest: r.guestName,
        setLabel: set ? `${set.rowLabel} · ${set.positionNo}` : `Set ${r.setId}`,
        tierName: set ? tierName(set) : 'Standard',
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

  /** Open the inline decline confirm (a two-step decline — no accidental cancellations). */
  protected onDecline(row: RequestRow): void {
    this.notice.set(undefined);
    this.declineConfirm.update((s) => new Set(s).add(row.bookingId));
  }

  protected onConfirmDecline(row: RequestRow): void {
    this.decide(row.bookingId, 'decline');
  }

  protected onCancelDecline(row: RequestRow): void {
    this.declineConfirm.update((s) => without(s, row.bookingId));
  }

  /** Dismiss an expired-race card: drop it from the queue and re-sync the badge. */
  protected onDismissExpired(row: RequestRow): void {
    this.expired.update((s) => without(s, row.bookingId));
    this.removeCard(row.bookingId);
  }

  private decide(bookingId: number, action: 'accept' | 'decline'): void {
    if (this.venueId === undefined || this.isDeciding(bookingId)) {
      return;
    }
    this.notice.set(undefined);
    this.declineConfirm.update((s) => without(s, bookingId));
    this.deciding.update((s) => new Set(s).add(bookingId));
    const call =
      action === 'accept'
        ? this.console.acceptRequest(this.venueId, bookingId)
        : this.console.declineRequest(this.venueId, bookingId);
    call.subscribe({
      next: (decision) => {
        this.stopDeciding(bookingId);
        this.notice.set(decisionNotice(action, decision.status));
        this.removeCard(bookingId); // instant optimistic removal…
        this.reconcile(); // …then re-sync the rest of the queue with server truth
      },
      error: (e: unknown) => this.onDecisionError(bookingId, action, e),
    });
  }

  /** Route an accept/decline failure: the sweep race → the in-card expired copy; stale → drop; else a notice. */
  private onDecisionError(bookingId: number, action: 'accept' | 'decline', e: unknown): void {
    this.stopDeciding(bookingId);
    const reason = requestErrorOf(e);
    switch (reason) {
      case 'REQUEST_EXPIRED':
        // Keep the card, flipped to the dismissible expired-race copy — do NOT reconcile it away.
        this.expired.update((s) => new Set(s).add(bookingId));
        break;
      case 'REQUEST_NOT_PENDING':
      case 'NO_SUCH_REQUEST':
        this.notice.set('That request was already handled — the queue has moved on.');
        this.removeCard(bookingId);
        this.reconcile(); // other cards may be stale too
        break;
      case 'UNAUTHORIZED':
        this.notice.set(SESSION_EXPIRED_MESSAGE);
        this.operator.sessionLost();
        break;
      default:
        this.notice.set(decisionFailureNotice(action, reason));
        break;
    }
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
    if (this.venueId === undefined) {
      return;
    }
    this.refreshNow();
    // Best-effort: the map only supplies set labels/tiers (date-independent); a failure degrades to
    // "Set {id}" / "Standard" and never blocks the queue. Read once — labels don't change under the tab.
    this.venueMap.load(this.venueId, todayBookingDate(new Date())).subscribe({
      next: (v) => this.venue.set(v),
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
    if (this.venueId === undefined) {
      return;
    }
    this.console.pendingRequests(this.venueId).subscribe({
      next: (r) => {
        this.requests.set(r);
        this.badge.set(r.length);
        this.pruneTransient(r);
        if (initial) {
          this.loaded.set(true);
        }
      },
      error: (e: unknown) => {
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

function tierName(set: SetView): string {
  return set.tier === 'PREMIUM' ? 'Front row' : 'Standard';
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
