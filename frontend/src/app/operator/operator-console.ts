import { Component, effect, inject, signal, untracked } from '@angular/core';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Observable } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { todayBookingDate } from '../shared/booking-date';
import { venueIdParam } from '../shared/parent-venue-id';
import { VenueMapView } from '../shared/venue-views';
import { TouchTarget } from '../shared/touch-target';
import { ConsoleStatsStrip } from './console-stats-strip';
import { ConsoleVenueMap } from './console-venue-map';
import { OperatorConsoleService } from './operator-console.service';
import { PendingApprovalBanner } from './pending-approval-banner';
import { PendingRequestsStore } from './pending-requests-store';

/** A console tab: its child-route path, its label, and whether it carries the live Requests badge. */
interface ConsoleTab {
  readonly path: string;
  readonly label: string;
  readonly badge?: boolean;
}

/**
 * Operator console shell. The porcelain-light glass chrome that
 * wraps the operator surface at `/operator/:venueId`: a sticky header (Operator wordmark, venue
 * title, signed-in-as, sign out) and the pill tab nav with a live Requests badge, hosting each tab
 * as a child route. The app shell (`app.ts`) suppresses all of its own chrome for
 * `/operator/:venueId` (`data.operatorConsole`), so this component owns the full viewport — every
 * other operator surface wears the shared operator chrome instead (`data.operatorChrome`).
 *
 * <p><strong>Always porcelain</strong>: the `data-riv-theme="porcelain"` host attribute re-scopes the
 * `--riv-*` tokens for the console subtree WITHOUT writing the document-level theme — so a tourist who
 * chose the dark `riviera` theme still sees a light console, and their choice is preserved on return.
 * The console never injects `ThemeService` and exposes no theme switcher.
 *
 * <p>It carries <strong>no sign-in gate</strong>: {@code operatorSessionGuard} owns
 * that, and because the guard awaits the session restore before deciding, the console needs no
 * "Checking your session…" state of its own either — it only ever renders for a signed-in operator.
 */
@Component({
  selector: 'app-operator-console',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ConsoleStatsStrip,
    PendingApprovalBanner,
    TouchTarget,
  ],
  templateUrl: './operator-console.html',
  styleUrl: './operator-console.scss',
  host: { 'data-riv-theme': 'porcelain' },
})
export class OperatorConsole {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly console = inject(OperatorConsoleService);
  private readonly requests = inject(PendingRequestsStore);
  protected readonly operator = inject(OperatorAuth);

  /** The venue this console manages — reactive to in-place `:venueId` changes: the router
   *  reuses this instance when only the param differs, so a snapshot read would pin the old venue. */
  protected readonly venueId = venueIdParam(this.route);

  /** The six console sections, in design order; only Requests carries the live badge. */
  protected readonly tabs: readonly ConsoleTab[] = [
    { path: 'beach-map', label: 'Beach map' },
    { path: 'pricing', label: 'Pricing' },
    { path: 'daily', label: 'Daily view' },
    { path: 'requests', label: 'Requests', badge: true },
    { path: 'payouts', label: 'Payouts' },
    { path: 'venue', label: 'Venue & commodities' },
  ];

  /** The venue name shown in the header, from the public venue read (best-effort). */
  protected readonly venueName = signal<string | undefined>(undefined);
  /** The venue map loaded per venue for the header, shared with the stats strip for its free/total tile. */
  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  /** The live pending-request count for the Requests tab badge — the shared store the Requests tab
   *  writes after every accept/decline, so the badge stays in sync with the queue. The shell
   *  seeds it from its own count read below; a failed read leaves it at 0 (no badge). */
  protected readonly requestsCount = this.requests.count;
  /** Bumped per venue context: an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead. */
  private epoch = 0;

  constructor() {
    // Load per session (the async /me restore resolves late) AND per venue param.
    effect(() => {
      const id = this.venueId();
      if (this.operator.signedIn() && id !== undefined) {
        untracked(() => this.load(id));
      }
    });
  }

  protected async onSignOut(): Promise<void> {
    await this.operator.signOut();
    this.venueName.set(undefined);
    this.venue.set(undefined);
    this.venueMap.reset(); // it outlives this component — the next operator must not inherit it
    this.requests.reset();
    // The guard gates on ACTIVATION, so leave ourselves rather than sit on a dead session.
    await this.router.navigate(['/account/sign-in'], { queryParams: { audience: 'operator' } });
  }

  /**
   * Load the header's venue title + the Requests badge count. Both are best-effort: a failed read
   * leaves the fallback title / no badge and never blocks the shell.
   */
  private load(venueId: number): void {
    const epoch = ++this.epoch;
    // A venue switch reuses this instance — drop the old name/map while the new one loads.
    this.venueName.set(undefined);
    this.venue.set(undefined);
    // Fresh load starts the badge at 0, so a slow/failed seed never shows a stale count — nor
    // one leaked from a previously-managed venue (the store is a root singleton). The Requests tab, once
    // visited, takes authority over this store via `set`; the shell only ever seeds it.
    this.requests.reset();
    // Continuations re-check the venue so a superseded venue's reads never land here.
    this.bestEffort(this.venueMap.load(venueId, todayBookingDate(new Date())), (venue) => {
      if (this.epoch === epoch) {
        this.venueName.set(venue.name);
        this.venue.set(venue);
      }
    });
    this.bestEffort(this.console.pendingRequestCount(venueId), (count) => {
      if (this.epoch === epoch) {
        this.requests.seed(count);
      }
    });
  }

  /** Subscribe to a best-effort read: apply the value, or silently ignore a failure. */
  private bestEffort<T>(source: Observable<T>, apply: (value: T) => void): void {
    source.subscribe({
      next: apply,
      error: () => {
        // best-effort — the console still works with the fallback title / no badge
      },
    });
  }
}
