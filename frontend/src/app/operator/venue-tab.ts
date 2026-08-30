import { NgOptimizedImage } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BookingCutoffField } from './booking-cutoff-field';
import { BookingModeField } from './booking-mode-field';
import { form, required, submit, FormField } from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { FieldErrorFor } from '../shared/field-error-for';
import { TouchTarget } from '../shared/touch-target';
import { Amenity, AMENITY_CATALOGUE, amenityLabel } from '../shared/amenities';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { formatCommissionPercent } from '../shared/commission-rate';
import { parentVenueId } from '../shared/parent-venue-id';
import { SegmentedControl, SegmentedOption } from '../shared/segmented-control';
import { parseWholeNumber } from '../shared/whole-number';
import { BookingMode, PhotoSlotKey } from '../shared/venue-views';
import {
  SalesCloseTime,
  VenueProfileErrorCode,
  VenueProfileUpdate,
  VenueProfileView,
} from './operator-console.model';
import { OperatorConsoleService, venueProfileErrorOf } from './operator-console.service';
import { StaleWriteBanner } from './stale-write-banner';
import {
  PhotoErrorCode,
  VenuePhotoService,
  photoErrorOf,
  previewUrlOf,
} from './venue-photo.service';

/** The editable venue-details fields, bound to the Signal Form (the read-only commission + payout
 *  currency are display-only signals, never part of the form/write). */
interface VenueDetailsModel {
  name: string;
  beach: string;
  region: string;
  description: string;
  bookingMode: BookingMode;
  bookingCutoff: string; // "HH:mm" Europe/Tirane
  salesClose: SalesCloseTime;
}

const EMPTY_DETAILS: VenueDetailsModel = {
  name: '',
  beach: '',
  region: '',
  description: '',
  bookingMode: 'INSTANT',
  bookingCutoff: '18:00',
  salesClose: '16:00',
};

/** The three fixed sales-close choices (invariant #4) — the union type IS the validator, so the
 *  form needs none; every option is a legal write. */
const SALES_CLOSE_OPTIONS: readonly SegmentedOption<SalesCloseTime>[] = [
  {
    value: '00:01',
    label: '00:01 — no same-day sales',
    description: 'Tourists can book ahead, never for today.',
    testId: 'venue-sales-close-00:01',
  },
  {
    value: '16:00',
    label: '16:00 — mid-afternoon',
    description: 'Today stays bookable until 16:00. The default.',
    testId: 'venue-sales-close-16:00',
  },
  {
    value: '23:59',
    label: '23:59 — all day',
    description: 'Today stays bookable until midnight.',
    testId: 'venue-sales-close-23:59',
  },
];

/** The three designed photo slots. All are tourist-surfaced in the Discover-card and beach-map
 *  slideshows; the cover leads both. */
const PHOTO_SLOTS: readonly { readonly key: PhotoSlotKey; readonly label: string }[] = [
  { key: 'cover', label: 'Cover photo — the beach' },
  { key: 'sunbeds', label: 'Sunbeds' },
  { key: 'bar', label: 'Bar / restaurant' },
];

/** Per-slot upload UI state: the current preview, an in-flight upload/delete, and the last failure. */
interface SlotUi {
  readonly previewUrl: string | null;
  readonly busy: boolean;
  readonly error: PhotoErrorCode | null;
}

const EMPTY_SLOT: SlotUi = { previewUrl: null, busy: false, error: null };
const EMPTY_SLOTS: Readonly<Record<PhotoSlotKey, SlotUi>> = {
  cover: EMPTY_SLOT,
  sunbeds: EMPTY_SLOT,
  bar: EMPTY_SLOT,
};

/**
 * The Venue &amp; commodities tab — the operator's venue-details form
 * (name/beach/region/description, booking mode, evening-before cutoff), the commodities amenity
 * toggle-chip row over the fixed catalogue, and the three photo slots with real upload / replace /
 * delete (pick = upload = replace, previewed from the returned PREVIEW variant URL).
 *
 * <p>Loads the owner-scoped profile (`GET /api/venues/{id}/profile`) — which carries the read-only
 * <strong>commission</strong> (shown as a %) and <strong>payout currency</strong> the tourist read
 * must never expose — and seeds the form. Save PATCHes the widened, owner-asserted profile write
 * (invariant #13); commission + payout currency are read-only and never sent (invariant #9). A save
 * failure shows operator-facing copy and drops a lost session (401). Always porcelain (console
 * shell); glass via {@link CardGlass}. Editing booking mode flips the venue's tourist booking flow
 * (Instant vs Request) — the reserve path reads the mode live.
 */
@Component({
  selector: 'app-venue-tab',
  imports: [
    BookingCutoffField,
    BookingModeField,
    FieldErrorFor,
    FormField,
    CardGlass,
    NgOptimizedImage,
    SegmentedControl,
    StaleWriteBanner,
    BusyAction,
    TouchTarget,
  ],
  templateUrl: './venue-tab.html',
})
export class VenueTab {
  private readonly route = inject(ActivatedRoute);
  private readonly console = inject(OperatorConsoleService);
  private readonly photos = inject(VenuePhotoService);
  protected readonly operator = inject(OperatorAuth);

  /** The venue this tab manages, from the parent `/operator/:venueId` route (undefined if
   *  invalid) — reactive to in-place venue switches, which reuse this instance. */
  protected readonly venueId = parentVenueId(this.route);

  protected readonly loaded = signal(false);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly errorCode = signal<VenueProfileErrorCode | null>(null);
  /** A field-level error for the distance input (not a Signal-Form field), so a bad metres value points
   *  the operator at the right field instead of a generic form-wide message. */
  protected readonly distanceError = signal(false);
  /** Bumped per venue context: an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead. */
  private epoch = 0;

  /** The optimistic-concurrency token loaded with the profile, echoed back on Save; a `409
   *  STALE_WRITE` means the venue moved on since — the tab keeps the edits and offers Reload. */
  protected readonly loadedVersion = signal<number | null>(null);

  /** Read-only display fields (from the loaded profile); never edited, never written. */
  protected readonly commissionBps = signal<number | null>(null);
  protected readonly payoutCurrency = signal<string | null>(null);
  /** Commission as a percentage for display, e.g. 1500 bps → "15%", 1550 → "15.5%". */
  protected readonly commissionPct = computed(() => {
    const bps = this.commissionBps();
    return bps === null ? '—' : formatCommissionPercent(bps);
  });

  /** The editable details, bound to the Signal Form; seeded from the loaded profile. */
  protected readonly details = signal<VenueDetailsModel>(EMPTY_DETAILS);
  protected readonly detailsForm = form(this.details, (path) => {
    required(path.name, { message: 'Venue name is required' });
    required(path.beach, { message: 'Beach is required' });
    required(path.region, { message: 'Region is required' });
    required(path.bookingCutoff, { message: 'Free-cancellation deadline is required' });
  });

  /** The three-choice sales-close options rendered by the segmented control. */
  protected readonly salesCloseOptions = SALES_CLOSE_OPTIONS;

  /** The commodities: amenity toggle set + distance-to-water string (edited, saved with the form). */
  protected readonly amenityCatalogue = AMENITY_CATALOGUE;
  protected readonly amenityDraft = signal<ReadonlySet<Amenity>>(new Set());
  protected readonly distanceDraft = signal('');

  protected readonly photoSlots = PHOTO_SLOTS;
  /** Per-slot photo UI state, seeded from the profile's `photos` map on load/reload. */
  protected readonly slotUi = signal<Readonly<Record<PhotoSlotKey, SlotUi>>>(EMPTY_SLOTS);

  constructor() {
    // Drop the "Saved" confirmation as soon as the operator edits any details field (a Signal-Form
    // field, so it has no per-field handler like the amenity/distance ones) — otherwise the banner
    // lingers after a save and a subsequent edit reads as already-persisted, a silent lost edit.
    effect(() => {
      this.details(); // track the form model: any edit re-fires this and clears the stale notice
      this.saved.set(false);
    });

    // Re-runs on an in-place venue switch: reset the form + flags, then load the new venue.
    effect(() => {
      const id = this.venueId();
      untracked(() => (id === undefined ? this.loaded.set(true) : this.resetForVenue(id)));
    });
  }

  /** Drop every venue-scoped field — form model, drafts, version token, photo slots — and load. */
  private resetForVenue(venueId: number): void {
    this.epoch++;
    this.details.set(EMPTY_DETAILS);
    this.amenityDraft.set(new Set());
    this.distanceDraft.set('');
    this.commissionBps.set(null);
    this.payoutCurrency.set(null);
    this.loadedVersion.set(null);
    this.slotUi.set(EMPTY_SLOTS);
    this.loaded.set(false);
    this.loadError.set(false);
    this.saving.set(false);
    this.saved.set(false);
    this.errorCode.set(null);
    this.distanceError.set(false);
    this.load(venueId);
  }

  protected isAmenityActive(code: Amenity): boolean {
    return this.amenityDraft().has(code);
  }

  protected amenityText(code: Amenity): string {
    return amenityLabel(code);
  }

  /** Flip an amenity in the working set (persisted only on Save); clears the stale saved notice. */
  protected onToggleAmenity(code: Amenity): void {
    this.amenityDraft.update((current) => {
      const next = new Set(current);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
    this.saved.set(false);
  }

  protected onDistanceInput(value: string): void {
    this.distanceDraft.set(value);
    this.saved.set(false);
    this.distanceError.set(false);
  }

  /**
   * Save the venue's editable profile: validate the form (Signal Forms marks touched + blocks an
   * invalid submit), parse the distance (blank ⇒ null; else a positive integer), then PATCH the
   * widened profile write. Commission + payout currency are never sent (read-only). A 401 drops the
   * lost session so the shell re-gates; other failures show operator-facing copy.
   */
  protected onSave(): void {
    const venueId = this.venueId();
    if (venueId === undefined || this.saving()) {
      return;
    }
    this.saved.set(false);
    this.errorCode.set(null);
    this.distanceError.set(false);
    void submit(this.detailsForm, async () => {
      const raw = this.distanceDraft().trim();
      let distanceToWaterM: number | null;
      if (raw === '') {
        distanceToWaterM = null;
      } else {
        const parsed = parseWholeNumber(raw);
        if (parsed === undefined || parsed <= 0) {
          // Field-level error at the distance input, not the generic form-wide message — the operator
          // can see exactly which field to fix (the distance isn't a Signal-Form field).
          this.distanceError.set(true);
          return;
        }
        distanceToWaterM = parsed;
      }
      const expectedVersion = this.loadedVersion();
      if (expectedVersion === null) {
        // The form is only interactable after a successful load seeds the version, so this is
        // defensive — never save without the token the server needs to detect a stale write.
        return;
      }
      const m = this.details();
      const request: VenueProfileUpdate = {
        name: m.name,
        beach: m.beach,
        region: m.region,
        description: m.description,
        bookingMode: m.bookingMode,
        bookingCutoff: m.bookingCutoff,
        salesClose: m.salesClose,
        amenities: [...this.amenityDraft()],
        distanceToWaterM,
        expectedVersion,
      };
      const epoch = this.epoch;
      this.saving.set(true);
      try {
        await firstValueFrom(this.console.updateVenueProfile(venueId, request));
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this save's UI state (#180); saving clears in finally
        }
        this.saved.set(true);
        // The conditional write bumped the row's version by exactly one; advance our token so a
        // second consecutive save by the same operator isn't spuriously rejected as a stale write.
        this.loadedVersion.set(expectedVersion + 1);
      } catch (error) {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this save's UI state (#180)
        }
        const code = venueProfileErrorOf(error);
        this.errorCode.set(code);
        if (code === 'UNAUTHORIZED') {
          this.operator.sessionLost();
        }
      } finally {
        this.saving.set(false);
      }
    });
  }

  /** The operator-facing message for a save/load failure code. */
  protected errorMessage(): string | undefined {
    switch (this.errorCode()) {
      case 'NOT_VENUE_OWNER':
        return 'You do not manage this venue, so its details can’t be changed.';
      case 'NO_SUCH_VENUE':
        return 'This venue could not be found.';
      case 'INVALID_REQUEST':
        return 'Please check the details and try again.';
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please sign in again.';
      case 'UNKNOWN':
        return 'Something went wrong saving your venue details. Please try again.';
      default:
        return undefined;
    }
  }

  private load(venueId: number): void {
    const epoch = this.epoch;
    this.console.venueProfile(venueId).subscribe({
      next: (profile) => {
        if (this.epoch === epoch) {
          this.seed(profile); // a superseded venue's profile never seeds the new venue's form (#180)
        }
      },
      error: (error: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this load (#180)
        }
        // A transient read failure must NOT read as a blank form — show an error instead.
        this.loadError.set(true);
        this.loaded.set(true);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.operator.sessionLost();
        }
      },
    });
  }

  private seed(profile: VenueProfileView): void {
    this.details.set({
      name: profile.name,
      beach: profile.beach,
      region: profile.region,
      description: profile.description ?? '',
      bookingMode: profile.bookingMode,
      bookingCutoff: profile.bookingCutoff,
      salesClose: profile.salesClose,
    });
    this.amenityDraft.set(new Set(profile.amenities));
    this.distanceDraft.set(
      profile.distanceToWaterM == null ? '' : String(profile.distanceToWaterM),
    );
    this.commissionBps.set(profile.commissionBps);
    this.payoutCurrency.set(profile.payoutCurrency);
    this.loadedVersion.set(profile.version);
    this.slotUi.set({
      cover: { ...EMPTY_SLOT, previewUrl: profile.photos.cover.previewUrl },
      sunbeds: { ...EMPTY_SLOT, previewUrl: profile.photos.sunbeds.previewUrl },
      bar: { ...EMPTY_SLOT, previewUrl: profile.photos.bar.previewUrl },
    });
    this.loaded.set(true);
  }

  private patchSlot(slot: PhotoSlotKey, patch: Partial<SlotUi>): void {
    this.slotUi.update((all) => ({ ...all, [slot]: { ...all[slot], ...patch } }));
  }

  /**
   * A file was picked for a slot: upload it (the server replaces the slot, so pick = upload
   * = replace) and show the returned PREVIEW variant. Validation is server-side — the processor's
   * magic-byte/size/dimension rejections come back as displayable codes; the client never
   * second-guesses the bytes. A 401 drops the lost session, like the profile save.
   */
  protected async onPhotoPicked(slot: PhotoSlotKey, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // re-picking the same file later must re-fire (change)
    const venueId = this.venueId();
    if (!file || venueId === undefined || this.slotUi()[slot].busy) {
      return;
    }
    const epoch = this.epoch;
    this.patchSlot(slot, { busy: true, error: null });
    try {
      const uploaded = await firstValueFrom(this.photos.upload(venueId, slot, file));
      if (this.epoch !== epoch) {
        return; // a venue switch superseded this upload's UI state (#180)
      }
      this.patchSlot(slot, { previewUrl: previewUrlOf(uploaded) });
    } catch (error) {
      if (this.epoch !== epoch) {
        return; // a venue switch superseded this upload's UI state (#180)
      }
      const code = photoErrorOf(error);
      this.patchSlot(slot, { error: code });
      if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    } finally {
      this.patchSlot(slot, { busy: false });
    }
  }

  /** Remove the slot's photo — a single-transaction erasure server-side (metadata + bytes). */
  protected async onPhotoRemove(slot: PhotoSlotKey): Promise<void> {
    const venueId = this.venueId();
    if (venueId === undefined || this.slotUi()[slot].busy) {
      return;
    }
    const epoch = this.epoch;
    this.patchSlot(slot, { busy: true, error: null });
    try {
      await firstValueFrom(this.photos.remove(venueId, slot));
      if (this.epoch !== epoch) {
        return; // a venue switch superseded this removal's UI state (#180)
      }
      this.patchSlot(slot, { previewUrl: null });
    } catch (error) {
      if (this.epoch !== epoch) {
        return; // a venue switch superseded this removal's UI state (#180)
      }
      const code = photoErrorOf(error);
      this.patchSlot(slot, { error: code });
      if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    } finally {
      this.patchSlot(slot, { busy: false });
    }
  }

  /** The operator-facing message for a photo upload/delete failure in a slot. */
  protected photoErrorMessage(slot: PhotoSlotKey): string | undefined {
    switch (this.slotUi()[slot].error) {
      case 'TOO_LARGE':
      case 'PAYLOAD_TOO_LARGE':
        return 'This image is too large — please use a photo under 25 MB.';
      case 'UNSUPPORTED_FORMAT':
        return 'Only JPEG, PNG, or WebP images are accepted.';
      case 'DIMENSIONS_EXCEEDED':
        return 'This image’s dimensions are too large — please use a smaller photo.';
      case 'UNREADABLE':
        return 'This image could not be read — please try a different file.';
      case 'NOT_VENUE_OWNER':
        return 'You do not manage this venue, so its photos can’t be changed.';
      case 'NO_SUCH_PHOTO':
        return 'This slot is already empty.';
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please sign in again.';
      case 'UNKNOWN':
        return 'Something went wrong with this photo. Please try again.';
      default:
        return undefined;
    }
  }

  /**
   * Recover from a `409 STALE_WRITE`: re-load the latest server profile — re-seeding every
   * field and the version — and clear the conflict banner. The preserve-edits UX is deliberate: a 409
   * itself never touches the form (so the operator keeps their work); only this explicit Reload
   * discards it in favour of the current server state, from which they re-apply and Save.
   */
  protected reloadAfterStale(): void {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    this.errorCode.set(null);
    this.load(venueId);
  }
}
