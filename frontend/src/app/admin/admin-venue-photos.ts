import { Component, inject, signal } from '@angular/core';

import { NgOptimizedImage } from '@angular/common';

import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { ConfirmWithReason } from '../shared/confirm-with-reason';
import { focusMover } from '../shared/focus-after-render';
import { PhotoSlotKey } from '../shared/venue-views';
import { AdminVenuePhotosService } from './admin-venue-photos.service';
import { ModerationVenue } from './admin-venues.service';
import { AdminPhotoSlotView } from './admin.model';
import { moderationVenuePicker } from './moderation-venue-picker';

import { TouchTarget } from '../shared/touch-target';

/** The slot labels, in the backend's `PhotoSlot` declaration order. */
const SLOT_LABELS: Readonly<Record<PhotoSlotKey, string>> = {
  cover: 'Cover',
  sunbeds: 'Sunbeds',
  bar: 'Bar',
};

/**
 * The admin console's Photos tab — the surface that makes the moderation takedown usable. Until this
 * tab, removing a reported photo meant hand-crafting an HTTP `DELETE` with a session cookie and a
 * CSRF token, which is not a thing anyone does from a phone when a report arrives by email.
 *
 * <p><strong>Why a venue picker at all.</strong> The admin holds no venue, so there is no "my venues"
 * to land in; a report names a venue and the moderator finds it. The list is the admin venue read,
 * shared with the Reviews tab through {@link AdminVenuesService}.
 *
 * <p><strong>Every slot renders, occupied or not.</strong> Emptiness is the null preview URL,
 * so a takedown just empties its slot in place — no re-fetch, and the grid never
 * reflows under the moderator mid-decision.
 *
 * <p><strong>The confirmation is the whole safety story.</strong> A takedown destroys bytes and there
 * is no undo, so Remove only *asks*, and the question names the venue and the slot — the
 * {@code admin-operators} suspend precedent, inline rather than modal, so there is nothing to
 * focus-trap and the action stays where it was clicked. The confirmation also collects
 * optional grounds, which ride the `X-Audit-Reason` header into the platform's admin audit trail.
 *
 * <p>Like every admin tab, the surrounding {@code AdminConsole} shell self-gates on
 * {@link OperatorAuth} for UX while the backend `/api/admin/**` role gate does the enforcing; this
 * component only ever renders once both have passed.
 */
@Component({
  selector: 'app-admin-venue-photos',
  imports: [NgOptimizedImage, CardGlass, ConfirmWithReason, BusyAction, TouchTarget],
  template: `
    <p class="mt-5 max-w-[62ch] text-[15px] text-riv-ink-soft">
      Removing a photo is immediate and permanent — that slot's image and every stored size are
      deleted. It removes one <strong>slot</strong>, not one picture: the same image published in
      another slot keeps serving from there, so each published slot is its own removal.
    </p>

    <div class="mt-5">
      <label for="admin-photos-venue-select" class="block text-[13.5px] font-semibold text-riv-ink"
        >Venue</label
      >
      <select
        appTouchTarget
        id="admin-photos-venue-select"
        data-testid="admin-photos-venue"
        [value]="picker.selectedVenueId() ?? ''"
        (change)="onVenuePicked($event)"
        class="mt-1 w-full max-w-[420px] rounded-[10px] border border-riv-field-border bg-white/70 px-3 py-2 text-[15px] text-riv-ink"
      >
        <option value="">Choose a venue…</option>
        @for (venue of picker.venues(); track venue.id) {
          <option [value]="venue.id">{{ venue.name }} — {{ venue.beach }}</option>
        }
      </select>
    </div>

    @if (picker.loading()) {
      <p class="mt-6 text-[15px] text-riv-ink-soft" data-testid="admin-photos-loading">Loading…</p>
    } @else if (picker.loadError()) {
      <p class="mt-6 text-[15px] text-riv-error-ink" role="alert" data-testid="admin-photos-error">
        Something went wrong loading this venue's photos.
        <button
          type="button"
          data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
          class="font-semibold underline"
          data-testid="admin-photos-retry"
          (click)="loadSlots()"
        >
          Retry
        </button>
      </p>
    } @else if (picker.selectedVenue(); as venue) {
      <ul role="list" class="mt-6 grid gap-4 sm:grid-cols-3">
        @for (slot of slots(); track slot.slot) {
          <li
            appCardGlass
            class="rounded-[14px] p-4"
            tabindex="-1"
            [attr.data-testid]="'admin-photo-slot-' + slot.slot"
          >
            <h2 class="text-[15px] font-semibold text-riv-card-ink">
              {{ label(slot.slot) }}
            </h2>

            @if (slot.previewUrl; as url) {
              <div class="relative mt-2 aspect-[3/2] w-full overflow-hidden rounded-[10px]">
                <img
                  [ngSrc]="url"
                  [alt]="'Current upload in the ' + slot.slot + ' slot of ' + venue.name"
                  fill
                  disableOptimizedSrcset
                  class="object-cover"
                  [attr.data-testid]="'admin-photo-preview-' + slot.slot"
                />
              </div>

              @if (confirming() === slot.slot) {
                <app-confirm-with-reason
                  class="mt-3"
                  label="Confirm photo removal"
                  [prompt]="removalPrompt(slot.slot, venue.name)"
                  [promptTestId]="'admin-photo-confirm-prompt-' + slot.slot"
                  [reasonId]="'admin-photo-reason-' + slot.slot"
                  reasonPlaceholder="e.g. reported by email — off-topic image"
                  confirmLabel="Remove"
                  cancelLabel="Keep it"
                  [panelTestId]="'admin-photo-confirm-panel-' + slot.slot"
                  [confirmTestId]="'admin-photo-confirm-' + slot.slot"
                  [cancelTestId]="'admin-photo-cancel-' + slot.slot"
                  [busy]="busy()"
                  [(reason)]="reason"
                  (confirmed)="remove(venue, slot.slot)"
                  (cancelled)="keepIt(slot.slot)"
                />
              } @else {
                <button
                  appTouchTarget
                  type="button"
                  [attr.data-testid]="'admin-photo-remove-' + slot.slot"
                  [appBusy]="busy()"
                  (click)="askToRemove(slot.slot)"
                  class="mt-3 rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                >
                  Remove {{ label(slot.slot) }} photo
                </button>
              }
            } @else {
              <p
                class="mt-2 flex aspect-[3/2] w-full items-center justify-center rounded-[10px] border border-dashed border-riv-field-border text-[14px] text-riv-card-ink-soft"
                [attr.data-testid]="'admin-photo-empty-' + slot.slot"
              >
                No photo
              </p>
            }
          </li>
        }
      </ul>
    }

    <p
      class="mt-4 min-h-[1.5rem] text-[15px] text-riv-ink-soft"
      role="status"
      aria-live="polite"
      tabindex="-1"
      data-testid="admin-photos-notice"
    >
      {{ notice() }}
    </p>
  `,
})
export class AdminVenuePhotos {
  private readonly service = inject(AdminVenuePhotosService);
  private readonly focusAfterRender = focusMover();

  protected readonly picker = moderationVenuePicker();
  protected readonly slots = signal<readonly AdminPhotoSlotView[]>([]);
  protected readonly confirming = signal<PhotoSlotKey | undefined>(undefined);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly notice = signal('');

  protected label(slot: PhotoSlotKey): string {
    return SLOT_LABELS[slot];
  }

  protected removalPrompt(slot: PhotoSlotKey, venueName: string): string {
    return `Remove the ${this.label(slot)} photo from ${venueName}? This cannot be undone.`;
  }

  /**
   * Open the confirmation, or close it, moving focus with the surface. Each transition destroys the
   * element that was just activated, which strands keyboard/AT focus on `<body>` unless focus is
   * moved deliberately (WCAG 2.4.3 — the recurring stranded-focus class). Focus INTO the
   * confirmation is {@link ConfirmWithReason}'s own doing; keeping it returns focus to Remove, and a
   * settled removal has no confirmation left to return to — success parks on the slot card, failure
   * on the notice carrying the reason, both only while this venue is still the one on screen.
   */
  protected askToRemove(slot: PhotoSlotKey): void {
    this.confirming.set(slot);
    this.reason.set('');
  }

  protected keepIt(slot: PhotoSlotKey): void {
    this.confirming.set(undefined);
    this.reason.set('');
    this.focusAfterRender(`admin-photo-remove-${slot}`);
  }

  protected onVenuePicked(event: Event): void {
    const picked = this.picker.pick(event);
    this.confirming.set(undefined);
    this.notice.set('');
    this.slots.set([]);
    if (picked !== undefined) {
      void this.loadSlots();
    }
  }

  protected async loadSlots(): Promise<void> {
    const venueId = this.picker.selectedVenueId();
    if (venueId === undefined) {
      return;
    }
    const ticket = this.picker.beginLoad();
    this.picker.loading.set(true);
    this.picker.loadError.set(false);
    try {
      const loaded = await this.service.slots(venueId);
      if (!this.picker.isCurrent(ticket)) {
        return;
      }
      this.slots.set(loaded.slots);
    } catch {
      if (this.picker.isCurrent(ticket)) {
        this.picker.loadError.set(true);
      }
    } finally {
      if (this.picker.isCurrent(ticket)) {
        this.picker.loading.set(false);
      }
    }
  }

  protected async remove(venue: ModerationVenue, slot: PhotoSlotKey): Promise<void> {
    this.busy.set(true);
    // Typed grounds ride the takedown into the audit trail; no reason → the two-argument call.
    const grounds = this.reason().trim();
    try {
      await (grounds === ''
        ? this.service.takedown(venue.id, slot)
        : this.service.takedown(venue.id, slot, grounds));
      this.ifStillViewing(venue, () => {
        // Empty the slot in place: the read model already says emptiness is the null URL.
        this.slots.update((slots) =>
          slots.map((each) => (each.slot === slot ? { ...each, previewUrl: null } : each)),
        );
        this.notice.set(`Removed the ${this.label(slot)} photo from ${venue.name}.`);
        this.focusAfterRender(`admin-photo-slot-${slot}`);
      });
    } catch {
      this.ifStillViewing(venue, () => {
        this.notice.set(`Could not remove the ${this.label(slot)} photo. Nothing was changed.`);
        // The `finally` destroys the confirmation whether or not the takedown worked.
        this.focusAfterRender('admin-photos-notice');
      });
    } finally {
      this.confirming.set(undefined);
      this.reason.set('');
      this.busy.set(false);
    }
  }
  /** Apply an action's outcome only while its own venue is still on screen — never under another's name. */
  private ifStillViewing(venue: ModerationVenue, apply: () => void): void {
    if (this.picker.isViewing(venue)) {
      apply();
    }
  }
}
