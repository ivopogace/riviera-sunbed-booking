import { Component, computed, inject, signal } from '@angular/core';
import { form, required, submit, FormField } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { formatMoney } from '../shared/money';
import { defaultBookingDate } from '../venue/booking-date';
import { BookingMode, Pool, SetView, Tier, VenueMapView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';
import { VenueAdminErrorCode } from './venue-admin.model';
import { VenueAdminService, venueAdminErrorOf } from './venue-admin.service';

/**
 * Operator beach-map editor (U7, issue #7). Sign in as the operator, create a venue, then lay out
 * its beach map by adding set positions (tier, pool, price in minor units, grid coordinates),
 * removing them, or moving one between the online/walk-in pools. Every change posts through
 * {@link VenueAdminService} and then the editor **re-reads the venue through the U1 read API**
 * ({@link VenueService}) — so what it renders is literally the round-trip, the core integration AC.
 *
 * <p>Forms are Signal Forms (`@angular/forms/signals`); numeric fields are kept as strings and
 * parsed on submit (the server re-validates ranges/tokens, invariants #3/#5/#12). The sign-in
 * inputs are plain signals — they need no field-level validation messaging.
 */
@Component({
  selector: 'app-venue-editor',
  imports: [FormField],
  templateUrl: './venue-editor.html',
  styleUrl: './venue-editor.scss',
})
export class VenueEditor {
  private readonly admin = inject(VenueAdminService);
  private readonly venues = inject(VenueService);
  protected readonly operator = inject(OperatorAuth);

  /** Operator sign-in (plain signals — trivial, no per-field validation messaging). */
  protected readonly username = signal('');
  protected readonly password = signal('');

  /** The created venue's id (undefined until the create form succeeds). */
  protected readonly venueId = signal<number | undefined>(undefined);
  /** The venue as re-read through the U1 read API after each change (the round-trip source). */
  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly saving = signal(false);
  private readonly errorCode = signal<VenueAdminErrorCode | undefined>(undefined);

  protected readonly sets = computed<readonly SetView[]>(() => this.venue()?.sets ?? []);

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

  // --- Add-set form ---
  protected readonly setModel = signal({
    rowLabel: '',
    positionNo: '',
    tier: 'PREMIUM',
    pool: 'ONLINE',
    priceMinor: '',
    priceCurrency: 'EUR',
    gridX: '',
    gridY: '',
  });
  protected readonly setForm = form(this.setModel, (path) => {
    required(path.rowLabel, { message: 'Row label is required' });
    required(path.positionNo, { message: 'Position number is required' });
    required(path.priceMinor, { message: 'Price (minor units) is required' });
    required(path.priceCurrency, { message: 'Currency is required' });
    required(path.gridX, { message: 'Grid column is required' });
    required(path.gridY, { message: 'Grid row is required' });
  });

  protected onSignIn(): void {
    if (!this.username() || !this.password()) {
      return;
    }
    this.operator.signIn(this.username(), this.password());
    this.errorCode.set(undefined);
  }

  protected onSignOut(): void {
    this.operator.signOut();
    this.password.set('');
  }

  protected onCreateVenue(): void {
    this.errorCode.set(undefined);
    submit(this.venueForm, async () => {
      const m = this.venueModel();
      const commissionBps = Number.parseInt(m.commissionBps, 10);
      if (!Number.isInteger(commissionBps)) {
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
        await this.reload();
      } catch (error) {
        this.errorCode.set(venueAdminErrorOf(error));
      } finally {
        this.saving.set(false);
      }
    });
  }

  protected onAddSet(): void {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    this.errorCode.set(undefined);
    submit(this.setForm, async () => {
      const m = this.setModel();
      const positionNo = Number.parseInt(m.positionNo, 10);
      const gridX = Number.parseInt(m.gridX, 10);
      const gridY = Number.parseInt(m.gridY, 10);
      const minorUnits = Number.parseInt(m.priceMinor, 10);
      if (![positionNo, gridX, gridY, minorUnits].every(Number.isInteger)) {
        this.errorCode.set('INVALID_REQUEST');
        return;
      }
      this.saving.set(true);
      try {
        await firstValueFrom(
          this.admin.addSet(venueId, {
            rowLabel: m.rowLabel,
            positionNo,
            tier: m.tier as Tier,
            pool: m.pool as Pool,
            price: { minorUnits, currency: m.priceCurrency },
            gridX,
            gridY,
          }),
        );
        this.resetSetForm();
        await this.reload();
      } catch (error) {
        this.errorCode.set(venueAdminErrorOf(error));
      } finally {
        this.saving.set(false);
      }
    });
  }

  protected async onRemoveSet(set: SetView): Promise<void> {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    await this.run(() => firstValueFrom(this.admin.removeSet(venueId, set.id)));
  }

  /** Move a set between the online and walk-in pools — the editable pool split (invariant #3). */
  protected async onTogglePool(set: SetView): Promise<void> {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    const pool: Pool = set.pool === 'ONLINE' ? 'WALK_IN' : 'ONLINE';
    await this.run(() =>
      firstValueFrom(
        this.admin.updateSet(venueId, set.id, {
          rowLabel: set.rowLabel,
          positionNo: set.positionNo,
          tier: set.tier,
          pool,
          price: set.price,
          gridX: set.gridX,
          gridY: set.gridY,
        }),
      ),
    );
  }

  /** Run a write, then re-read the venue through the read API; map any failure to a message. */
  private async run(write: () => Promise<unknown>): Promise<void> {
    this.errorCode.set(undefined);
    this.saving.set(true);
    try {
      await write();
      await this.reload();
    } catch (error) {
      this.errorCode.set(venueAdminErrorOf(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async reload(): Promise<void> {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    const venue = await firstValueFrom(
      this.venues.getVenueMap(venueId, defaultBookingDate(new Date())),
    );
    this.venue.set(venue);
  }

  private resetSetForm(): void {
    this.setModel.set({
      rowLabel: '',
      positionNo: '',
      tier: 'PREMIUM',
      pool: 'ONLINE',
      priceMinor: '',
      priceCurrency: 'EUR',
      gridX: '',
      gridY: '',
    });
  }

  protected money(set: SetView): string {
    return formatMoney(set.price);
  }

  /** Accessible name for a laid-out set (state not by position alone). */
  protected setLabel(set: SetView): string {
    const tier = set.tier === 'PREMIUM' ? 'premium' : 'standard';
    const pool = set.pool === 'ONLINE' ? 'online pool' : 'walk-in pool';
    return `${set.rowLabel} position ${set.positionNo}, ${tier}, ${pool}, ${this.money(set)}, cell ${set.gridX}×${set.gridY}`;
  }

  protected errorMessage(): string | undefined {
    switch (this.errorCode()) {
      case 'UNAUTHORIZED':
        return 'Your operator sign-in was rejected. Check your credentials and sign in again.';
      case 'CELL_TAKEN':
      case 'LAYOUT_CONFLICT':
        return 'Another set already occupies that grid cell. Pick a different column/row.';
      case 'DUPLICATE_POSITION':
        return 'Another set already has that row label and position number.';
      case 'NO_SUCH_VENUE':
        return 'That venue no longer exists.';
      case 'NO_SUCH_SET':
        return 'That set no longer exists.';
      case 'INVALID_REQUEST':
        return 'Please check the form values and try again.';
      case 'UNKNOWN':
        return 'Something went wrong. Please try again.';
      default:
        return undefined;
    }
  }
}
