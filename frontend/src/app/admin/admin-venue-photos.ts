import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { PhotoSlotKey } from '../shared/venue-views';
import { AdminConsoleTabs } from './admin-console-tabs';
import { AdminVenuePhotosService, ModerationVenue } from './admin-venue-photos.service';
import { AdminPhotoSlotView } from './admin.model';

/** The slot labels, in the backend's `PhotoSlot` declaration order (#142). */
const SLOT_LABELS: Readonly<Record<PhotoSlotKey, string>> = {
  cover: 'Cover',
  sunbeds: 'Sunbeds',
  bar: 'Bar',
};

/**
 * The admin console's Photos tab (#511) — the surface that makes #504's takedown usable. Until this
 * tab, removing a reported photo meant hand-crafting an HTTP `DELETE` with a session cookie and a
 * CSRF token, which is not a thing anyone does from a phone when a report arrives by email.
 *
 * <p><strong>Why a venue picker at all.</strong> The admin holds no venue, so there is no "my venues"
 * to land in; a report names a venue and the moderator finds it. The list is the public catalogue —
 * public data, every venue, no publish filter — so no admin venue endpoint had to be invented.
 *
 * <p><strong>Every slot renders, occupied or not.</strong> Emptiness is the null preview URL (#142
 * review F-11), so a takedown just empties its slot in place — no re-fetch, and the grid never
 * reflows under the moderator mid-decision.
 *
 * <p><strong>The confirmation is the whole safety story.</strong> A takedown destroys bytes and there
 * is no undo, so Remove only *asks*, and the question names the venue and the slot — the
 * {@code admin-operators} suspend precedent, inline rather than modal, so there is nothing to
 * focus-trap and the action stays where it was clicked. Since #507 the confirmation also collects
 * optional grounds, which ride the `X-Audit-Reason` header into the platform's admin audit trail.
 *
 * <p>Like every admin tab, the page self-gates on {@link OperatorAuth} for UX while the backend
 * `/api/admin/**` role gate does the enforcing. Porcelain-themed to match the operator console.
 */
@Component({
  selector: 'app-admin-venue-photos',
  imports: [RouterLink, NgOptimizedImage, CardGlass, AdminConsoleTabs],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section class="mx-auto max-w-[860px] px-4 py-10" aria-labelledby="admin-photos-title">
      <h1 id="admin-photos-title" class="text-[24px] font-semibold text-(--riv-ink)">Photos</h1>

      @if (auth.restoring()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-photos-restoring">
          Loading…
        </p>
      } @else if (!auth.signedIn()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-photos-signed-out">
          Sign in as an admin to moderate venue photos.
          <a
            routerLink="/account/sign-in"
            [queryParams]="{ audience: 'operator', returnUrl: '/admin/photos' }"
            class="font-semibold underline"
            >Sign in</a
          >
        </p>
      } @else if (!auth.isAdmin()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-photos-forbidden">
          You don't have access to this page.
        </p>
      } @else {
        <app-admin-console-tabs label="Admin console sections" />

        <p class="mt-5 max-w-[62ch] text-[15px] text-(--riv-ink-soft)">
          Removing a photo is immediate and permanent — that slot's image and every stored size are
          deleted. It removes one <strong>slot</strong>, not one picture: the same image published in
          another slot keeps serving from there, so each published slot is its own removal.
        </p>

        <div class="mt-5">
          <label
            for="admin-photos-venue-select"
            class="block text-[13.5px] font-semibold text-(--riv-ink)"
            >Venue</label
          >
          <select
            id="admin-photos-venue-select"
            data-testid="admin-photos-venue"
            [value]="selectedVenueId() ?? ''"
            (change)="onVenuePicked($event)"
            class="mt-1 w-full max-w-[420px] rounded-[10px] border border-(--riv-field-border) bg-white/70 px-3 py-2 text-[15px] text-(--riv-ink)"
          >
            <option value="">Choose a venue…</option>
            @for (venue of venues(); track venue.id) {
              <option [value]="venue.id">{{ venue.name }} — {{ venue.beach }}</option>
            }
          </select>
        </div>

        @if (loading()) {
          <p class="mt-6 text-[15px] text-(--riv-ink-soft)" data-testid="admin-photos-loading">
            Loading…
          </p>
        } @else if (loadError()) {
          <p class="mt-6 text-[15px] text-[#b3261e]" role="alert" data-testid="admin-photos-error">
            Something went wrong loading this venue's photos.
            <button
              type="button"
              class="font-semibold underline"
              data-testid="admin-photos-retry"
              (click)="loadSlots()"
            >
              Retry
            </button>
          </p>
        } @else if (selectedVenue(); as venue) {
          <ul role="list" class="mt-6 grid gap-4 sm:grid-cols-3">
            @for (slot of slots(); track slot.slot) {
              <li
                appCardGlass
                class="rounded-[14px] p-4"
                tabindex="-1"
                [attr.data-testid]="'admin-photo-slot-' + slot.slot"
              >
                <h2 class="text-[15px] font-semibold text-(--riv-card-ink)">
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
                    <p
                      class="mt-3 text-[14px] text-(--riv-card-ink)"
                      [attr.data-testid]="'admin-photo-confirm-prompt-' + slot.slot"
                    >
                      Remove the {{ label(slot.slot) }} photo from {{ venue.name }}? This cannot be
                      undone.
                    </p>
                    <label
                      [attr.for]="'admin-photo-reason-' + slot.slot"
                      class="mt-2 block text-[13.5px] font-semibold text-(--riv-card-ink)"
                      >Reason (optional)</label
                    >
                    <input
                      type="text"
                      maxlength="500"
                      [attr.id]="'admin-photo-reason-' + slot.slot"
                      [attr.data-testid]="'admin-photo-reason-' + slot.slot"
                      [value]="reason()"
                      (input)="onReasonTyped($event)"
                      placeholder="e.g. reported by email — off-topic image"
                      class="mt-1 w-full rounded-[10px] border border-(--riv-field-border) bg-white/70 px-3 py-2 text-[14px] text-(--riv-card-ink)"
                    />
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        [attr.data-testid]="'admin-photo-confirm-' + slot.slot"
                        [disabled]="busy()"
                        (click)="remove(venue, slot.slot)"
                        class="rounded-[10px] border border-[#b3261e] px-4 py-2 text-[14px] font-semibold text-[#b3261e] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        [attr.data-testid]="'admin-photo-cancel-' + slot.slot"
                        (click)="keepIt(slot.slot)"
                        class="rounded-[10px] px-3 py-2 text-[14px] font-semibold text-(--riv-card-ink-soft)"
                      >
                        Keep it
                      </button>
                    </div>
                  } @else {
                    <button
                      type="button"
                      [attr.data-testid]="'admin-photo-remove-' + slot.slot"
                      [disabled]="busy()"
                      (click)="askToRemove(slot.slot)"
                      class="mt-3 rounded-[10px] border border-(--riv-field-border) px-4 py-2 text-[14px] font-semibold text-(--riv-card-ink) disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove {{ label(slot.slot) }} photo
                    </button>
                  }
                } @else {
                  <p
                    class="mt-2 flex aspect-[3/2] w-full items-center justify-center rounded-[10px] border border-dashed border-(--riv-field-border) text-[14px] text-(--riv-card-ink-soft)"
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
          class="mt-4 min-h-[1.5rem] text-[15px] text-(--riv-ink-soft)"
          role="status"
          aria-live="polite"
          data-testid="admin-photos-notice"
        >
          {{ notice() }}
        </p>
      }
    </section>
  `,
})
export class AdminVenuePhotos {
  protected readonly auth = inject(OperatorAuth);
  private readonly service = inject(AdminVenuePhotosService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly venues = signal<readonly ModerationVenue[]>([]);
  protected readonly selectedVenueId = signal<number | undefined>(undefined);
  protected readonly slots = signal<readonly AdminPhotoSlotView[]>([]);
  protected readonly confirming = signal<PhotoSlotKey | undefined>(undefined);
  protected readonly reason = signal('');
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');

  protected readonly selectedVenue = computed(() =>
    this.venues().find((venue) => venue.id === this.selectedVenueId()),
  );

  private loaded = false;
  private loadGeneration = 0;

  constructor() {
    // Load the catalogue once the admin session is confirmed (restore settled + ROLE_ADMIN present).
    effect(() => {
      if (!this.auth.restoring() && this.auth.isAdmin() && !this.loaded) {
        this.loaded = true;
        void this.loadVenues();
      }
    });
  }

  protected label(slot: PhotoSlotKey): string {
    return SLOT_LABELS[slot];
  }

  /**
   * Open the confirmation and put focus on it. Each of the three transitions below destroys the
   * element that was just activated, which strands keyboard/AT focus on `<body>` unless focus is
   * moved deliberately (WCAG 2.4.3 — the recurring #148/#351/#462 class, fixed the same way in
   * #505). Asking moves focus to the confirm button; keeping it returns focus to Remove; a completed
   * removal has no Remove button left to return to, so focus parks on the slot card itself.
   */
  protected askToRemove(slot: PhotoSlotKey): void {
    this.confirming.set(slot);
    this.reason.set('');
    this.focusAfterRender(`admin-photo-confirm-${slot}`);
  }

  protected keepIt(slot: PhotoSlotKey): void {
    this.confirming.set(undefined);
    this.reason.set('');
    this.focusAfterRender(`admin-photo-remove-${slot}`);
  }

  protected onReasonTyped(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  protected onVenuePicked(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.abandonInFlightLoad();
    this.selectedVenueId.set(value === '' ? undefined : Number(value));
    this.confirming.set(undefined);
    this.notice.set('');
    this.slots.set([]);
    if (value !== '') {
      void this.loadSlots();
    }
  }

  protected async loadSlots(): Promise<void> {
    const venueId = this.selectedVenueId();
    if (venueId === undefined) {
      return;
    }
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const loaded = await this.service.slots(venueId);
      if (generation !== this.loadGeneration) {
        return;
      }
      this.slots.set(loaded.slots);
    } catch {
      if (generation === this.loadGeneration) {
        this.loadError.set(true);
      }
    } finally {
      if (generation === this.loadGeneration) {
        this.loading.set(false);
      }
    }
  }

  /**
   * Retire whatever load is in flight and clear its pending state.
   *
   * <p>The staleness test is a <strong>generation counter, not the selected venue id</strong>, and the
   * difference is not academic: an id check calls a response current whenever its venue is on screen,
   * so leaving venue 7 and coming back re-requests it and the *older* of the two answers can land
   * last and win. Only "is this the newest request I issued" is actually monotonic. Clearing
   * `loading` here is the other half — deselecting back to "Choose a venue…" issues no new request,
   * so nothing else would ever turn the spinner off.
   */
  private abandonInFlightLoad(): void {
    this.loadGeneration++;
    this.loading.set(false);
    this.loadError.set(false);
  }

  protected async remove(venue: ModerationVenue, slot: PhotoSlotKey): Promise<void> {
    this.busy.set(true);
    // #507: typed grounds ride the takedown into the audit trail; no reason → the two-argument call.
    const grounds = this.reason().trim();
    try {
      await (grounds === ''
        ? this.service.takedown(venue.id, slot)
        : this.service.takedown(venue.id, slot, grounds));
      this.reportOnlyIfStillViewing(venue, () => {
        // Empty the slot in place: the read model already says emptiness is the null URL.
        this.slots.update((slots) =>
          slots.map((each) => (each.slot === slot ? { ...each, previewUrl: null } : each)),
        );
        this.notice.set(`Removed the ${this.label(slot)} photo from ${venue.name}.`);
        this.focusAfterRender(`admin-photo-slot-${slot}`);
      });
    } catch {
      this.reportOnlyIfStillViewing(venue, () =>
        this.notice.set(`Could not remove the ${this.label(slot)} photo. Nothing was changed.`),
      );
    } finally {
      this.confirming.set(undefined);
      this.reason.set('');
      this.busy.set(false);
    }
  }

  /**
   * Apply a takedown's outcome only while its own venue is still on screen. Without this guard a
   * removal that settles after the admin switched venues would blank the *new* venue's same-named
   * slot — showing a live photo as gone — and narrate the old venue's name under the new venue's UI.
   */
  private reportOnlyIfStillViewing(venue: ModerationVenue, apply: () => void): void {
    if (this.selectedVenueId() === venue.id) {
      apply();
    }
  }

  /** Move focus to a test-id'd element once the swap it belongs to has actually rendered. */
  private focusAfterRender(testId: string): void {
    afterNextRender(
      () =>
        this.hostRef.nativeElement
          .querySelector<HTMLElement>(`[data-testid="${testId}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  private async loadVenues(): Promise<void> {
    try {
      this.venues.set(await this.service.venues());
    } catch {
      this.loadError.set(true);
    }
  }
}
