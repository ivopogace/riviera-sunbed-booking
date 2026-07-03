import { Component, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { OperatorAuth, signInFailureMessage } from '../core/operator-auth';
import { todayBookingDate } from '../venue/booking-date';
import { VenueService } from '../venue/venue.service';
import { OperatorConsoleService } from './operator-console.service';

/** A console tab: its child-route path, its label, and whether it carries the live Requests badge. */
interface ConsoleTab {
  readonly path: string;
  readonly label: string;
  readonly badge?: boolean;
}

/**
 * Operator console shell (issue #170, epic #141 foundation). The porcelain-light glass chrome that
 * wraps the operator surface at `/operator/:venueId`: a sign-in gate, a sticky header (Operator
 * wordmark, venue title, signed-in-as, sign out) and — from Phase 2 — the pill tab nav with a live
 * Requests badge, hosting each tab as a child route. The tourist app shell (`app.ts`) suppresses its
 * own chrome for `/operator/**`, so this component owns the full viewport.
 *
 * <p><strong>Always porcelain</strong>: the `data-riv-theme="porcelain"` host attribute re-scopes the
 * `--riv-*` tokens for the console subtree WITHOUT writing the document-level theme — so a tourist who
 * chose the dark `riviera` theme still sees a light console, and their choice is preserved on return
 * (AC-6). The console never injects `ThemeService` and exposes no theme switcher.
 *
 * <p>Sign-in reuses the session-based {@link OperatorAuth} (issue #109) — plain signals mirroring the
 * venue-editor / staff-daily operator sign-in; failure copy stays generic (`signInFailureMessage`).
 */
@Component({
  selector: 'app-operator-console',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './operator-console.html',
  styleUrl: './operator-console.scss',
  host: { 'data-riv-theme': 'porcelain' },
})
export class OperatorConsole {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly console = inject(OperatorConsoleService);
  protected readonly operator = inject(OperatorAuth);

  /** The venue this console manages, read once from the route param (like StaffDaily). */
  protected readonly venueId: number | undefined;

  /** The six console sections, in design order; only Requests carries the live badge. */
  protected readonly tabs: readonly ConsoleTab[] = [
    { path: 'beach-map', label: 'Beach map' },
    { path: 'pricing', label: 'Pricing' },
    { path: 'daily', label: 'Daily view' },
    { path: 'requests', label: 'Requests', badge: true },
    { path: 'payouts', label: 'Payouts' },
    { path: 'venue', label: 'Venue & commodities' },
  ];

  /** Operator sign-in (plain signals — trivial, no per-field validation messaging). */
  protected readonly username = signal('');
  protected readonly password = signal('');
  /** True while the sign-in POST is in flight (button disabled, no double submit). */
  protected readonly signingIn = signal(false);
  /** A generic sign-in failure message (design D-8), or undefined. */
  protected readonly signInError = signal<string | undefined>(undefined);

  /** The venue name shown in the header, from the public venue read (best-effort). */
  protected readonly venueName = signal<string | undefined>(undefined);
  /** The live pending-request count for the Requests tab badge (0 when none or the read fails). */
  protected readonly requestsCount = signal(0);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('venueId'));
    // A valid venue id is a positive integer; a non-numeric or non-positive segment leaves venueId
    // undefined so the template shows a not-found state instead of a shell with broken tab links.
    if (Number.isInteger(id) && id > 0) {
      this.venueId = id;
    }
    // Load the header's venue title + the Requests badge count once a session exists — covers a
    // fresh sign-in AND the async /me restore (issue #109), which resolves after construction.
    effect(() => {
      if (this.operator.signedIn()) {
        untracked(() => {
          this.loadVenue();
          this.loadRequestsCount();
        });
      }
    });
  }

  protected async onSignIn(): Promise<void> {
    if (!this.username() || !this.password() || this.signingIn()) {
      return;
    }
    this.signingIn.set(true);
    this.signInError.set(undefined);
    // Server-validated (issue #109): the session is established here or the failure is known here.
    const result = await this.operator.signIn(this.username(), this.password());
    this.signingIn.set(false);
    if (result === 'signed-in') {
      this.password.set('');
    } else {
      this.signInError.set(signInFailureMessage(result));
    }
  }

  protected async onSignOut(): Promise<void> {
    await this.operator.signOut();
    this.password.set('');
    this.venueName.set(undefined);
    this.requestsCount.set(0);
  }

  /** Best-effort header title: a failed venue read leaves the fallback and never blocks the shell. */
  private loadVenue(): void {
    if (this.venueId === undefined) {
      return;
    }
    this.venues.getVenueMap(this.venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => this.venueName.set(venue.name),
      error: () => {
        // Best-effort — the header keeps its fallback title; the console still works.
      },
    });
  }

  /** Best-effort Requests badge count: a failed read leaves it at 0 and never blocks the shell. */
  private loadRequestsCount(): void {
    if (this.venueId === undefined) {
      return;
    }
    this.console.pendingRequestCount(this.venueId).subscribe({
      next: (count) => this.requestsCount.set(count),
      error: () => {
        // Best-effort — no badge shows; the console still works.
      },
    });
  }
}
