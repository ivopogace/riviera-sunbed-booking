import { Component, computed, effect, inject, signal } from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { ConfirmWithReason } from '../shared/confirm-with-reason';
import { focusMover } from '../shared/focus-after-render';
import { starGlyphs, starsOutOfFive } from '../shared/rating';
import { formatStayMonth } from '../shared/stay-month';
import { TouchTarget } from '../shared/touch-target';
import { formatMoment } from './admin-moment';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminVenuesService, ModerationVenue } from './admin-venues.service';
import { AdminReviewEntryView } from './admin.model';

const BTN =
  'rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

/**
 * The admin console's Reviews tab — the surface that makes the review takedown usable: every review
 * of any venue, hidden and star-only rows included, each with its one moderation action.
 *
 * <p><strong>Hide asks, un-hide does not.</strong> A hide takes a guest's words off the venue page
 * and out of its score, so it goes behind the inline confirmation that names the review and the
 * venue and collects optional grounds for the audit trail (the photo-takedown precedent). It is
 * reversible, so the prompt never says "cannot be undone". Un-hiding restores; one press.
 *
 * <p><strong>A row flips in place.</strong> The server answers a bare `204`, so the row shows the
 * new state from the moment of the press — the venue is not re-read, and the list never reflows
 * under the moderator. The "hidden since" moment is the press; a later read shows the server's,
 * seconds apart at most.
 *
 * <p>Like every admin tab, the surrounding {@code AdminConsole} shell self-gates on
 * {@link OperatorAuth} for UX while the backend `/api/admin/**` role gate does the enforcing.
 */
@Component({
  selector: 'app-admin-reviews',
  imports: [CardGlass, ConfirmWithReason, BusyAction, TouchTarget],
  template: `
    <p class="mt-5 max-w-[62ch] text-[15px] text-riv-ink-soft">
      Hiding a review takes it off the venue page and out of the venue's score until you un-hide it.
      The guest can still read their own review on their booking page, marked as removed from public
      view, but can no longer change it.
    </p>

    <div class="mt-5">
      <label for="admin-reviews-venue-select" class="block text-[13.5px] font-semibold text-riv-ink"
        >Venue</label
      >
      <select
        appTouchTarget
        id="admin-reviews-venue-select"
        data-testid="admin-reviews-venue"
        [value]="selectedVenueId() ?? ''"
        (change)="onVenuePicked($event)"
        class="mt-1 w-full max-w-[420px] rounded-[10px] border border-riv-field-border bg-white/70 px-3 py-2 text-[15px] text-riv-ink"
      >
        <option value="">Choose a venue…</option>
        @for (venue of venues(); track venue.id) {
          <option [value]="venue.id">{{ venue.name }} — {{ venue.beach }}</option>
        }
      </select>
    </div>

    @if (loading() && entries().length === 0) {
      <p class="mt-6 text-[15px] text-riv-ink-soft" data-testid="admin-reviews-loading">Loading…</p>
    } @else if (loadError()) {
      <p class="mt-6 text-[15px] text-riv-error-ink" role="alert" data-testid="admin-reviews-error">
        Something went wrong loading this venue's reviews.
        <button
          type="button"
          data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
          class="font-semibold underline"
          data-testid="admin-reviews-retry"
          (click)="loadReviews()"
        >
          Retry
        </button>
      </p>
    } @else if (selectedVenue(); as venue) {
      @if (entries().length === 0) {
        <p class="mt-6 text-[15px] text-riv-ink-soft" data-testid="admin-reviews-empty">
          No reviews yet for {{ venue.name }}.
        </p>
      } @else {
        <ul role="list" class="mt-6 flex flex-col gap-3" data-testid="admin-reviews-list">
          @for (entry of entries(); track entry.id) {
            <li
              appCardGlass
              class="rounded-[14px] p-4"
              tabindex="-1"
              [attr.data-testid]="'admin-review-' + entry.id"
            >
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  role="img"
                  [attr.aria-label]="starsLabel(entry)"
                  [attr.data-testid]="'admin-review-stars-' + entry.id"
                  class="text-[17px] leading-none tracking-[0.14em] text-riv-accent-ink"
                  ><span aria-hidden="true">{{ glyphs(entry) }}</span></span
                >
                <span
                  class="text-[13px] font-bold text-riv-card-ink"
                  [attr.data-testid]="'admin-review-name-' + entry.id"
                  >{{ nameOf(entry) }}</span
                >
                <span class="text-[12.5px] text-riv-card-ink-soft">
                  Stayed {{ stayMonth(entry) }} · written {{ moment(entry.createdAt) }}
                </span>
                @if (entry.hiddenAt; as hiddenAt) {
                  <span
                    class="rounded-full border border-riv-danger-border bg-riv-danger-fill px-2.5 py-0.5 text-[12px] font-semibold text-riv-danger-ink"
                    [attr.data-testid]="'admin-review-hidden-' + entry.id"
                  >
                    Hidden since {{ moment(hiddenAt) }}
                  </span>
                }
              </div>

              @if (entry.comment; as comment) {
                <p
                  class="mt-2 text-[14px] leading-[1.5] text-riv-card-ink"
                  [attr.data-testid]="'admin-review-comment-' + entry.id"
                >
                  {{ comment }}
                </p>
              } @else {
                <p
                  class="mt-2 text-[14px] text-riv-card-ink-soft italic"
                  [attr.data-testid]="'admin-review-no-comment-' + entry.id"
                >
                  No comment — a star-only review.
                </p>
              }

              @if (confirming() === entry.id) {
                <app-confirm-with-reason
                  class="mt-3"
                  label="Confirm hiding this review"
                  [prompt]="hidePrompt(entry, venue.name)"
                  [promptTestId]="'admin-review-confirm-prompt-' + entry.id"
                  [reasonId]="'admin-review-reason-' + entry.id"
                  reasonPlaceholder="e.g. reported by the venue — abusive"
                  confirmLabel="Hide"
                  cancelLabel="Keep it"
                  [panelTestId]="'admin-review-confirm-panel-' + entry.id"
                  [confirmTestId]="'admin-review-confirm-' + entry.id"
                  [cancelTestId]="'admin-review-cancel-' + entry.id"
                  [busy]="busy()"
                  [(reason)]="reason"
                  (confirmed)="hide(venue, entry)"
                  (cancelled)="keepIt(entry)"
                />
              } @else if (entry.hiddenAt) {
                <button
                  appTouchTarget
                  type="button"
                  [attr.data-testid]="'admin-review-unhide-' + entry.id"
                  [appBusy]="busy()"
                  (click)="unhide(venue, entry)"
                  class="mt-3 ${BTN}"
                >
                  Un-hide
                </button>
              } @else {
                <button
                  appTouchTarget
                  type="button"
                  [attr.data-testid]="'admin-review-hide-' + entry.id"
                  [appBusy]="busy()"
                  (click)="askToHide(entry)"
                  class="mt-3 ${BTN}"
                >
                  Hide
                </button>
              }
            </li>
          }
        </ul>
        @if (nextCursor() !== null) {
          <button
            appTouchTarget
            type="button"
            data-testid="admin-reviews-more"
            [appBusy]="loading()"
            (click)="loadMore()"
            class="mt-4 ${BTN}"
          >
            {{ loading() ? 'Loading…' : 'Show more reviews' }}
          </button>
        }
      }
    }

    <p
      class="mt-4 min-h-[1.5rem] text-[15px] text-riv-ink-soft"
      role="status"
      aria-live="polite"
      tabindex="-1"
      data-testid="admin-reviews-notice"
    >
      {{ notice() }}
    </p>
  `,
})
export class AdminReviews {
  private readonly auth = inject(OperatorAuth);
  private readonly venueList = inject(AdminVenuesService);
  private readonly service = inject(AdminReviewsService);
  private readonly focusAfterRender = focusMover();

  protected readonly venues = signal<readonly ModerationVenue[]>([]);
  protected readonly selectedVenueId = signal<number | undefined>(undefined);
  protected readonly entries = signal<readonly AdminReviewEntryView[]>([]);
  protected readonly nextCursor = signal<number | null>(null);
  protected readonly confirming = signal<number | undefined>(undefined);
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
    // Load the venue list once the admin session is confirmed (restore settled + ROLE_ADMIN present).
    effect(() => {
      if (!this.auth.restoring() && this.auth.isAdmin() && !this.loaded) {
        this.loaded = true;
        void this.loadVenues();
      }
    });
  }

  protected glyphs(entry: AdminReviewEntryView): string {
    return starGlyphs(entry.stars);
  }

  protected starsLabel(entry: AdminReviewEntryView): string {
    return starsOutOfFive(entry.stars);
  }

  protected nameOf(entry: AdminReviewEntryView): string {
    return entry.displayName ?? 'A guest';
  }

  protected stayMonth(entry: AdminReviewEntryView): string {
    return formatStayMonth(entry.stayedIn);
  }

  protected moment(isoInstant: string): string {
    return formatMoment(isoInstant);
  }

  protected hidePrompt(entry: AdminReviewEntryView, venueName: string): string {
    return `Hide ${possessive(entry)} review of ${venueName}? It leaves the venue page and the score until you un-hide it.`;
  }

  /**
   * Open the confirmation, or close it, moving focus with the surface: each transition destroys the
   * control that was just activated (WCAG 2.4.3). Focus INTO the confirmation is
   * {@link ConfirmWithReason}'s own doing; keeping it returns focus to Hide; a settled action parks
   * on the row card, a failed one on the notice carrying the reason — both only while this venue is
   * still the one on screen.
   */
  protected askToHide(entry: AdminReviewEntryView): void {
    this.confirming.set(entry.id);
    this.reason.set('');
  }

  protected keepIt(entry: AdminReviewEntryView): void {
    this.confirming.set(undefined);
    this.reason.set('');
    this.focusAfterRender(`admin-review-hide-${entry.id}`);
  }

  protected onVenuePicked(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.abandonInFlightLoad();
    this.selectedVenueId.set(value === '' ? undefined : Number(value));
    this.confirming.set(undefined);
    this.notice.set('');
    this.entries.set([]);
    this.nextCursor.set(null);
    if (value !== '') {
      void this.loadReviews();
    }
  }

  protected async loadReviews(): Promise<void> {
    this.entries.set([]);
    this.nextCursor.set(null);
    await this.loadPage(undefined);
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (cursor !== null && !this.loading()) {
      await this.loadPage(cursor);
    }
  }

  private async loadPage(cursor: number | undefined): Promise<void> {
    const venueId = this.selectedVenueId();
    if (venueId === undefined) {
      return;
    }
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const page = await this.service.reviews(venueId, cursor);
      if (generation !== this.loadGeneration) {
        return;
      }
      const first = page.reviews[0];
      this.entries.update((entries) => [...entries, ...page.reviews]);
      this.nextCursor.set(page.nextCursor);
      // Show more destroys itself on the last page; land on the first new row rather than <body>.
      if (cursor !== undefined && first !== undefined) {
        this.focusAfterRender(`admin-review-${first.id}`);
      }
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

  /** Retire whatever load is in flight; the staleness test is this counter, not the venue id. */
  private abandonInFlightLoad(): void {
    this.loadGeneration++;
    this.loading.set(false);
    this.loadError.set(false);
  }

  protected async hide(venue: ModerationVenue, entry: AdminReviewEntryView): Promise<void> {
    this.busy.set(true);
    const grounds = this.reason().trim();
    try {
      await (grounds === '' ? this.service.hide(entry.id) : this.service.hide(entry.id, grounds));
      this.reportOnlyIfStillViewing(venue, () => {
        this.flip(entry.id, new Date().toISOString());
        this.notice.set(`Hid ${possessive(entry)} review of ${venue.name}.`);
        this.focusAfterRender(`admin-review-${entry.id}`);
      });
    } catch {
      this.reportOnlyIfStillViewing(venue, () => {
        this.notice.set('Could not hide the review. Nothing was changed.');
        this.focusAfterRender('admin-reviews-notice');
      });
    } finally {
      this.confirming.set(undefined);
      this.reason.set('');
      this.busy.set(false);
    }
  }

  protected async unhide(venue: ModerationVenue, entry: AdminReviewEntryView): Promise<void> {
    this.busy.set(true);
    try {
      await this.service.unhide(entry.id);
      this.reportOnlyIfStillViewing(venue, () => {
        this.flip(entry.id, null);
        this.notice.set(`${capitalised(possessive(entry))} review is back in public view.`);
        this.focusAfterRender(`admin-review-${entry.id}`);
      });
    } catch {
      // Nothing was destroyed: the pressed button survives, so focus stays and the status announces.
      this.reportOnlyIfStillViewing(venue, () =>
        this.notice.set('Could not un-hide the review. Nothing was changed.'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private flip(reviewId: number, hiddenAt: string | null): void {
    this.entries.update((entries) =>
      entries.map((each) => (each.id === reviewId ? { ...each, hiddenAt } : each)),
    );
  }

  /** Apply an action's outcome only while its own venue is still on screen — never under another's name. */
  private reportOnlyIfStillViewing(venue: ModerationVenue, apply: () => void): void {
    if (this.selectedVenueId() === venue.id) {
      apply();
    }
  }

  private async loadVenues(): Promise<void> {
    try {
      this.venues.set(await this.venueList.venues());
    } catch {
      this.loadError.set(true);
    }
  }
}

/** "Ana’s" for a named review, "this guest’s" for one written before names were collected. */
function possessive(entry: AdminReviewEntryView): string {
  return entry.displayName === null ? 'this guest’s' : `${entry.displayName}’s`;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
