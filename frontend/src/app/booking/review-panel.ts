import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';

import { BookingStatus } from '../shared/booking-status';
import { BusyAction } from '../shared/busy-action';
import { formatDeadline } from '../shared/deadline';
import { FieldGlass } from '../shared/field-glass';
import { focusMover } from '../shared/focus-after-render';
import { StarRating } from '../shared/star-rating';
import { TouchTarget } from '../shared/touch-target';
import {
  OwnReviewView,
  REVIEW_COMMENT_MAX,
  REVIEW_DISPLAY_NAME_MAX,
  ReviewPanel as ReviewPanelState,
  SubmitReviewRequest,
} from './booking.model';

/** The required rule's message. Stated on the schema; the parent's result region renders the same constant. */
export const REVIEW_REQUIRED = 'Pick a star rating.';

const COMMENT_TOO_LONG = `Keep your comment to ${REVIEW_COMMENT_MAX} characters or fewer.`;
const NAME_REQUIRED = 'Add the name to show with your review.';
const NAME_TOO_LONG = `Keep the name to ${REVIEW_DISPLAY_NAME_MAX} characters or fewer.`;

const BTN =
  'cursor-pointer rounded-[14px] px-[18px] py-[11px] text-[14px] motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-65';
const BTN_OUTLINE = `${BTN} border-[1.5px] bg-[#f4f6f7] font-semibold [transition:background_0.15s_ease] hover:bg-[#e7ebec]`;

/**
 * The panel's Tailwind recipes. Stated here rather than imported from the booking view: that view
 * imports this component, so reaching back for its constants would close a cycle. The contrast spec
 * pins the resulting inks on both sides.
 */
const CLS = {
  section: 'mt-5 border-t border-riv-card-track pt-[18px]',
  title: 'mx-0 mt-0 mb-1.5 text-[16px] font-bold text-riv-card-ink',
  note: 'mx-0 mt-0 mb-3.5 text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  field: 'mt-3.5 flex flex-col gap-1.5',
  fieldLabel: 'text-[11px] font-bold tracking-[0.1em] uppercase text-riv-card-ink-soft',
  input:
    'rounded-[11px] px-3 py-2 text-[14px] focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink',
  textarea:
    'resize-y rounded-[11px] px-3 py-2 text-[14px] focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink',
  fieldError: 'text-[12px] font-semibold text-riv-error-ink',
  actions: 'mt-3.5 flex flex-wrap gap-2.5',
  btnOutline: `${BTN_OUTLINE} border-[rgba(255,255,255,0.7)] text-[#0a4f5e]`,
  btnOutlineDanger: `${BTN_OUTLINE} border-[rgba(200,90,60,0.5)] text-[#a3372a]`,
  ownCard: 'rounded-[16px] border border-riv-card-track bg-riv-wash-fill px-[15px] py-3',
  ownStars: 'm-0 text-[17px] leading-none tracking-[0.14em] text-riv-accent-ink',
  ownName: 'mx-0 mt-2 mb-0 text-[13px] font-bold text-riv-card-ink',
  ownComment: 'mx-0 mt-1.5 mb-0 text-[14px] leading-[1.5] text-riv-card-ink',
  confirmQ: 'mx-0 mt-3.5 mb-3 text-[14px] font-semibold text-riv-card-ink',
} as const;

/** The model behind the one form the panel shows, whether it is writing a review or rewriting one. */
interface ReviewFormModel {
  stars: number | null;
  comment: string;
  displayName: string;
}

/**
 * What the form starts from for a given panel: the stored review when there is one to rewrite,
 * otherwise an empty form carrying the server's name suggestion. Pure, so the seed is a property of
 * the panel rather than something a lifecycle hook has to remember to apply.
 */
function seedFor(panel: ReviewPanelState): ReviewFormModel {
  if (panel.kind === 'ALREADY_REVIEWED') {
    return {
      stars: panel.review.stars,
      comment: panel.review.comment ?? '',
      displayName: panel.review.displayName ?? '',
    };
  }
  return {
    stars: null,
    comment: '',
    displayName: panel.kind === 'ELIGIBLE' ? (panel.nameSuggestion ?? '') : '',
  };
}

/** `★★★★☆` for 4 — the read-only echo of a stored rating, beside its numeric accessible name. */
function starsLabel(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

/**
 * The booking page's review section: the rating form, the guest's own verdict with its edit and
 * delete affordances, a frozen verdict, and — for every stay that can carry none — the reason why.
 *
 * <p>It renders by exhaustive `@switch` over the server's review panel, never over the booking
 * status: every fence behind the panel is the review module's, and a stay stops being reviewable
 * without its status moving. The one place status is consulted is the not-yet-checked-in note,
 * which is an invitation and so only makes sense for a stay still ahead of the guest.
 *
 * <p>The panel holds no HTTP and no result copy: it emits what the guest asked for, and the parent
 * booking view sends it, re-reads, and narrates the outcome in its own live region — which has to
 * outlive this component, since a successful write is exactly what replaces the form.
 */
@Component({
  imports: [BusyAction, FieldGlass, FormField, NgTemplateOutlet, StarRating, TouchTarget],
  selector: 'app-review-panel',
  template: `
    @switch (panel().kind) {
      @case ('ELIGIBLE') {
        <section [class]="cls.section" aria-labelledby="review-title" data-testid="review-panel">
          <h2 id="review-title" [class]="cls.title">How was your stay?</h2>
          <p [class]="cls.note">
            Rate {{ venueName() }} from one to five stars, and add a few words if you like. You can
            change or remove your review until {{ deadline() }}.
          </p>
          <ng-container [ngTemplateOutlet]="reviewFormTemplate" />
        </section>
      }
      @case ('ALREADY_REVIEWED') {
        <section [class]="cls.section" aria-labelledby="review-title" data-testid="review-panel">
          <h2 id="review-title" [class]="cls.title">Your review</h2>
          @if (editing()) {
            <p [class]="cls.note">Change your review of {{ venueName() }}, then save it.</p>
            <ng-container [ngTemplateOutlet]="reviewFormTemplate" />
          } @else {
            <p [class]="cls.note">
              You can change or remove it until {{ deadline() }}, after which it stays as written.
            </p>
            <ng-container [ngTemplateOutlet]="ownReviewTemplate" />
            @if (confirmingDelete()) {
              <p [class]="cls.confirmQ" data-testid="confirm-delete-question">
                Remove your review of {{ venueName() }}? This cannot be undone.
              </p>
              <div [class]="cls.actions" role="group" aria-label="Confirm removing your review">
                <button
                  appTouchTarget
                  type="button"
                  [class]="cls.btnOutlineDanger"
                  [appBusy]="busy()"
                  data-testid="confirm-delete-review"
                  (click)="deleted.emit()"
                >
                  {{ busy() ? 'Removing…' : 'Yes, remove it' }}
                </button>
                <button
                  appTouchTarget
                  type="button"
                  [class]="cls.btnOutline"
                  [appBusy]="busy()"
                  data-testid="keep-review"
                  (click)="keepReview()"
                >
                  Keep my review
                </button>
              </div>
            } @else {
              <div [class]="cls.actions">
                <button
                  appTouchTarget
                  type="button"
                  [class]="cls.btnOutline"
                  data-testid="edit-review"
                  (click)="startEdit()"
                >
                  Change my review
                </button>
                <button
                  appTouchTarget
                  type="button"
                  [class]="cls.btnOutlineDanger"
                  data-testid="start-delete-review"
                  (click)="startDelete()"
                >
                  Remove my review
                </button>
              </div>
            }
          }
        </section>
      }
      @case ('FROZEN') {
        <section [class]="cls.section" aria-labelledby="review-title" data-testid="review-panel">
          <h2 id="review-title" [class]="cls.title">Your review</h2>
          <p [class]="cls.note" data-testid="review-frozen-note">
            Reviews can be changed for 60 days after your stay. That window has closed, so this one
            stays as you wrote it.
          </p>
          <ng-container [ngTemplateOutlet]="ownReviewTemplate" />
        </section>
      }
      @case ('WINDOW_CLOSED') {
        <section [class]="cls.section" aria-labelledby="review-title" data-testid="review-panel">
          <h2 id="review-title" [class]="cls.title">Rating this stay</h2>
          <p [class]="cls.note" data-testid="review-window-closed-note">
            Stays can be rated for 60 days afterwards. That window has closed for this one.
          </p>
        </section>
      }
      @case ('NOT_COMPLETED') {
        @if (bookingStatus() === 'CONFIRMED') {
          <section [class]="cls.section" aria-labelledby="review-title" data-testid="review-panel">
            <h2 id="review-title" [class]="cls.title">Rating this stay</h2>
            <p [class]="cls.note" data-testid="review-not-completed-note">
              You can rate {{ venueName() }} once the staff have checked you in.
            </p>
          </section>
        }
      }
    }

    <ng-template #ownReviewTemplate>
      <div [class]="cls.ownCard" data-testid="own-review">
        <p
          role="img"
          [class]="cls.ownStars"
          [attr.aria-label]="ownStarsLabel()"
          data-testid="own-review-stars"
        >
          <span aria-hidden="true">{{ ownStars() }}</span>
        </p>
        @if (own()?.displayName; as name) {
          <p [class]="cls.ownName" data-testid="own-review-name">{{ name }}</p>
        }
        @if (own()?.comment; as comment) {
          <p [class]="cls.ownComment" data-testid="own-review-comment">{{ comment }}</p>
        }
      </div>
    </ng-template>

    <ng-template #reviewFormTemplate>
      <form (submit)="send(); $event.preventDefault()" novalidate>
        <app-star-rating label="Your rating" [formField]="reviewForm.stars" />

        <label [class]="cls.field">
          <span [class]="cls.fieldLabel">Your comment (optional)</span>
          <textarea
            appTouchTarget
            appFieldGlass
            rows="4"
            [class]="cls.textarea"
            [formField]="reviewForm.comment"
            data-testid="review-comment"
          ></textarea>
          @if (submitAttempted() && reviewForm.comment().errors().length) {
            <span [class]="cls.fieldError" role="alert" data-testid="review-comment-error">{{
              reviewForm.comment().errors()[0].message
            }}</span>
          }
        </label>

        <label [class]="cls.field">
          <span [class]="cls.fieldLabel">Show my name as</span>
          <input
            appTouchTarget
            appFieldGlass
            type="text"
            autocomplete="nickname"
            [class]="cls.input"
            [formField]="reviewForm.displayName"
            data-testid="review-display-name"
          />
          @if (submitAttempted() && reviewForm.displayName().errors().length) {
            <span [class]="cls.fieldError" role="alert" data-testid="review-display-name-error">{{
              reviewForm.displayName().errors()[0].message
            }}</span>
          }
        </label>

        <div [class]="cls.actions">
          <button
            appTouchTarget
            type="submit"
            [class]="cls.btnOutline"
            [appBusy]="busy()"
            data-testid="submit-review"
          >
            {{ submitLabel() }}
          </button>
          @if (editing()) {
            <button
              appTouchTarget
              type="button"
              [class]="cls.btnOutline"
              [appBusy]="busy()"
              data-testid="cancel-edit-review"
              (click)="cancelEdit()"
            >
              Cancel
            </button>
          }
        </div>
      </form>
    </ng-template>
  `,
})
export class ReviewPanel {
  /** The repeated Tailwind recipes (see {@link CLS}), exposed to the template. */
  protected readonly cls = CLS;

  /** The server's answer for this stay's review section — the only thing the panel renders on. */
  readonly panel = input.required<ReviewPanelState>();
  /** Consulted for the not-yet-checked-in note alone: an invitation only a live stay should get. */
  readonly bookingStatus = input.required<BookingStatus>();
  readonly venueName = input.required<string>();
  /** A write is in flight upstairs, so the pressed control says so rather than accepting a second. */
  readonly busy = input(false);

  readonly submitted = output<SubmitReviewRequest>();
  readonly updated = output<SubmitReviewRequest>();
  readonly deleted = output<void>();
  /**
   * The form refused to send and the reason belongs in the parent's result region — the star
   * control has no inline error slot of its own, so its message is funnelled the way it always was.
   */
  readonly blocked = output<string>();

  /** Reseeded whenever the panel changes, which is what makes a successful write reset the form. */
  private readonly model = linkedSignal(() => seedFor(this.panel()));

  protected readonly reviewForm = form(this.model, (path) => {
    required(path.stars, { message: REVIEW_REQUIRED });
    maxLength(path.comment, REVIEW_COMMENT_MAX, { message: COMMENT_TOO_LONG });
    required(path.displayName, { message: NAME_REQUIRED });
    maxLength(path.displayName, REVIEW_DISPLAY_NAME_MAX, { message: NAME_TOO_LONG });
  });

  protected readonly submitAttempted = signal(false);
  /** Both reset with the panel: a re-read that changes the section must never leave a stale mode. */
  protected readonly editing = linkedSignal<ReviewPanelState, boolean>({
    source: () => this.panel(),
    computation: () => false,
  });
  protected readonly confirmingDelete = linkedSignal<ReviewPanelState, boolean>({
    source: () => this.panel(),
    computation: () => false,
  });

  private readonly focusAfterRender = focusMover();

  protected readonly own = computed<OwnReviewView | undefined>(() => {
    const panel = this.panel();
    return panel.kind === 'ALREADY_REVIEWED' || panel.kind === 'FROZEN' ? panel.review : undefined;
  });

  protected readonly ownStars = computed(() => starsLabel(this.own()?.stars ?? 0));

  protected readonly ownStarsLabel = computed(() => {
    const stars = this.own()?.stars ?? 0;
    return `${stars} out of 5 stars`;
  });

  protected readonly deadline = computed(() => {
    const panel = this.panel();
    return panel.kind === 'ELIGIBLE' || panel.kind === 'ALREADY_REVIEWED'
      ? formatDeadline(panel.windowClosesAt)
      : '';
  });

  protected readonly submitLabel = computed(() => {
    if (this.busy()) {
      return 'Sending…';
    }
    return this.editing() ? 'Save changes' : 'Submit review';
  });

  protected startEdit(): void {
    this.submitAttempted.set(false);
    this.editing.set(true);
    this.focusAfterRender('review-comment');
  }

  protected cancelEdit(): void {
    this.model.set(seedFor(this.panel()));
    this.submitAttempted.set(false);
    this.editing.set(false);
    this.focusAfterRender('edit-review');
  }

  protected startDelete(): void {
    this.confirmingDelete.set(true);
    this.focusAfterRender('confirm-delete-review');
  }

  protected keepReview(): void {
    this.confirmingDelete.set(false);
    this.focusAfterRender('start-delete-review');
  }

  /**
   * Hand the written review upstairs, or say why not. Validity is the schema's answer, so each rule
   * has one home; the `null` test beside it narrows the type rather than restating the rule.
   */
  protected send(): void {
    if (this.busy()) {
      return;
    }
    this.submitAttempted.set(true);
    const value = this.model();
    if (!this.reviewForm().valid() || value.stars === null) {
      if (value.stars === null) {
        this.blocked.emit(REVIEW_REQUIRED);
      }
      return;
    }
    const review: SubmitReviewRequest = {
      stars: value.stars,
      comment: value.comment.trim() === '' ? null : value.comment.trim(),
      displayName: value.displayName.trim(),
    };
    if (this.editing()) {
      this.updated.emit(review);
    } else {
      this.submitted.emit(review);
    }
  }

  /**
   * The write this panel asked for has landed. The edit / confirm interaction is over at that
   * point, so the mode closes here rather than waiting for the re-read — which the booking view
   * deliberately lets fail without flipping the page, and which would otherwise leave a live
   * "Yes, remove it" under a "review removed" line.
   */
  settle(): void {
    this.editing.set(false);
    this.confirmingDelete.set(false);
    this.submitAttempted.set(false);
  }
}
