import { Component, inject, signal } from '@angular/core';
import { form, required, submit, FormField } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { parseWholeNumber } from '../shared/whole-number';
import { BookingMode } from '../venue/venue.model';
import { VenueAdminErrorCode } from './venue-admin.model';
import { VenueAdminService, venueAdminErrorOf } from './venue-admin.service';

/**
 * Venue onboarding (U7) — sign in as an operator and **create** a venue. This is all that remains of
 * the legacy in-page venue editor: editing an existing venue's beach-map layout (O3 #172), row
 * pricing (O4 #174) and details/commodities (O8 #177) now lives in the operator console's tabs, so
 * this page's editing role is retired (issue #177). It stays the reachable "Create a venue" entry
 * point (linked from the console header); on success it links the operator into the console for the
 * new venue to lay out its map. Signal Forms for the create form; the sign-in inputs are plain
 * signals. The server re-validates every field (invariants #3/#5/#12); numeric fields are parsed on submit.
 */
@Component({
  selector: 'app-venue-editor',
  imports: [FormField, RouterLink],
  templateUrl: './venue-editor.html',
  styleUrl: './venue-editor.scss',
})
export class VenueEditor {
  private readonly admin = inject(VenueAdminService);
  private readonly router = inject(Router);
  private readonly ownedVenues = inject(OwnedVenues);
  protected readonly operator = inject(OperatorAuth);

  /** The created venue's id (undefined until the create form succeeds) — then we link to its console. */
  protected readonly venueId = signal<number | undefined>(undefined);
  protected readonly saving = signal(false);
  private readonly errorCode = signal<VenueAdminErrorCode | undefined>(undefined);

  // --- Create-venue form ---
  protected readonly venueModel = signal({
    name: '',
    beach: '',
    region: '',
    description: '',
    bookingMode: 'INSTANT',
    commissionBps: '1500',
    payoutCurrency: 'EUR',
    bookingCutoff: '18:00',
  });
  protected readonly venueForm = form(this.venueModel, (path) => {
    required(path.name, { message: 'Venue name is required' });
    required(path.beach, { message: 'Beach is required' });
    required(path.region, { message: 'Region is required' });
    required(path.commissionBps, { message: 'Commission (bps) is required' });
    required(path.payoutCurrency, { message: 'Payout currency is required' });
    required(path.bookingCutoff, { message: 'Cutoff time is required' });
  });

  protected async onSignOut(): Promise<void> {
    await this.operator.signOut();
    // The guard gates on ACTIVATION, so leave the page ourselves rather than sit on a dead session.
    await this.router.navigate(['/account/sign-in'], { queryParams: { audience: 'operator' } });
  }

  protected onCreateVenue(): void {
    this.errorCode.set(undefined);
    submit(this.venueForm, async () => {
      const m = this.venueModel();
      const commissionBps = parseWholeNumber(m.commissionBps);
      if (commissionBps === undefined) {
        this.errorCode.set('INVALID_REQUEST');
        return;
      }
      this.saving.set(true);
      try {
        const created = await firstValueFrom(
          this.admin.createVenue({
            name: m.name,
            beach: m.beach,
            region: m.region,
            description: m.description,
            bookingMode: m.bookingMode as BookingMode,
            commissionBps,
            payoutCurrency: m.payoutCurrency,
            bookingCutoff: m.bookingCutoff,
          }),
        );
        this.venueId.set(created.id);
        // The operator now owns one more venue, so the cached landing list is stale (S9 #277):
        // without this, /operator would keep forwarding a first-time creator back to onboarding.
        this.ownedVenues.reset();
      } catch (error) {
        this.failWrite(error);
      } finally {
        this.saving.set(false);
      }
    });
  }

  /**
   * Map a write failure to its message and, on a 401, drop the lost session so the sign-in form
   * re-renders (issue #109): the server session can expire/invalidate mid-create, and without
   * clearing local auth state the operator is stuck on the signed-in card retrying a dead session.
   */
  private failWrite(error: unknown): void {
    const code = venueAdminErrorOf(error);
    this.errorCode.set(code);
    if (code === 'UNAUTHORIZED') {
      this.operator.sessionLost();
    }
  }

  protected errorMessage(): string | undefined {
    const code = this.errorCode();
    if (code === undefined) {
      return undefined;
    }
    switch (code) {
      case 'UNAUTHORIZED':
        return 'Your operator session has expired. Please sign in again.';
      case 'NO_SUCH_VENUE':
        return 'That venue no longer exists.';
      case 'INVALID_REQUEST':
        return 'Please check the form values and try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
