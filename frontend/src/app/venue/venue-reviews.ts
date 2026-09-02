import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { focusMover } from '../shared/focus-after-render';
import { reviewsLabel, starGlyphs, starsOutOfFive } from '../shared/rating';
import { RetryButton } from '../shared/retry-button';
import { formatStayMonth } from '../shared/stay-month';
import { TouchTarget } from '../shared/touch-target';
import { VenueReviewEntry } from '../shared/venue-views';
import { VenueService } from './venue.service';

/** One listed review, ready to render: glyphs and their name, the attribution, the stay month. */
interface ReviewEntryView {
  readonly id: number;
  readonly glyphs: string;
  readonly starsLabel: string;
  readonly name: string;
  readonly stayed: string;
  readonly comment: string;
}

/** The name a review is shown under when its row carries none (a star-only-era row). */
const ANONYMOUS = 'A guest';

const BTN =
  'cursor-pointer rounded-[14px] px-[18px] py-[11px] text-[14px] motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-65';

/**
 * The section's Tailwind recipes: the overview card's glass for the section, the review panel's
 * own-review wash for each entry, and its outline button for the control. Restated here rather
 * than imported from `booking/` — a `venue/` → `booking/` edge is the one this feature must not add.
 */
const CLS = {
  section:
    'mt-5 backdrop-blur-[26px] backdrop-saturate-[1.7] rounded-[28px] shadow-[0_14px_44px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.8)] p-5 min-[1280px]:[margin-inline:calc((100%_-_1100px)/2)]',
  title: 'mx-0 mt-0 mb-3.5 text-[19px] font-bold tracking-[-0.01em] text-riv-card-ink',
  note: 'mx-0 my-0 text-[14px] leading-[1.5] text-riv-card-ink-soft',
  list: 'm-0 flex list-none flex-col gap-3 p-0',
  card: 'rounded-[16px] border border-riv-card-track bg-riv-wash-fill px-[15px] py-3 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink',
  stars: 'm-0 text-[17px] leading-none tracking-[0.14em] text-riv-accent-ink',
  meta: 'mx-0 mt-2 mb-0 text-[13px] text-riv-card-ink-soft',
  name: 'font-bold text-riv-card-ink',
  comment: 'mx-0 mt-1.5 mb-0 text-[14px] leading-[1.5] text-riv-card-ink',
  actions: 'mt-3.5 flex flex-wrap items-center gap-2.5',
  more: `${BTN} border-[1.5px] border-riv-solid-btn-border bg-riv-solid-btn-fill font-semibold text-riv-solid-btn-ink [transition:background_0.15s_ease] hover:bg-riv-solid-btn-hover`,
} as const;

/**
 * The venue page's review section: past guests' listed reviews — stars, display name, the month
 * of their stay, their words — newest first, a page at a time behind "Show more reviews". The
 * header's aggregate is the score; this is the reading behind it, so a venue whose ratings all came
 * without a comment shows the score up there and a quiet empty state here.
 *
 * <p>Pages append rather than replace, so the section owns its own fetch (the venue map's
 * epoch-guarded `subscribe` idiom) instead of a `resource`. When "Show more" delivers the last page
 * the control leaves, and when a retry replaces the failure line, so focus is moved onto the first
 * review just listed rather than left on `<body>` (WCAG 2.4.3).
 */
@Component({
  selector: 'app-venue-reviews',
  imports: [BusyAction, CardGlass, RetryButton, TouchTarget],
  host: { class: 'block' },
  template: `
    <section
      appCardGlass
      [class]="cls.section"
      aria-labelledby="venue-reviews-heading"
      data-testid="venue-reviews"
    >
      <h2 id="venue-reviews-heading" [class]="cls.title" data-testid="venue-reviews-heading">
        Guest reviews
      </h2>

      @if (loading() && !loadedOnce()) {
        <p [class]="cls.note" aria-hidden="true" data-testid="venue-reviews-loading">
          Loading reviews…
        </p>
      }

      @if (entries().length > 0) {
        <ul [class]="cls.list" data-testid="venue-reviews-list">
          @for (entry of entries(); track entry.id) {
            <li [class]="cls.card" tabindex="-1" [attr.data-testid]="'review-entry-' + entry.id">
              <p
                role="img"
                [class]="cls.stars"
                [attr.aria-label]="entry.starsLabel"
                data-testid="review-stars"
              >
                <span aria-hidden="true">{{ entry.glyphs }}</span>
              </p>
              <p [class]="cls.meta">
                <span [class]="cls.name" data-testid="review-name">{{ entry.name }}</span>
                <span aria-hidden="true"> · </span>
                <span data-testid="review-stay">Stayed {{ entry.stayed }}</span>
              </p>
              <p [class]="cls.comment" data-testid="review-comment">{{ entry.comment }}</p>
            </li>
          }
        </ul>
      } @else if (loadedOnce() && !failed()) {
        <p [class]="cls.note" data-testid="venue-reviews-empty">
          No written reviews yet — ratings so far came without a comment.
        </p>
      }

      @if (failed()) {
        <div [class]="cls.actions">
          <p [class]="cls.note" role="alert" data-testid="venue-reviews-error">
            Reviews couldn’t be loaded.
          </p>
          <app-retry-button testId="venue-reviews-retry" (retry)="retry()" />
        </div>
      } @else if (nextCursor() !== null) {
        <div [class]="cls.actions">
          <button
            type="button"
            appTouchTarget
            [appBusy]="loading()"
            [class]="cls.more"
            data-testid="venue-reviews-more"
            (click)="more()"
          >
            Show more reviews
          </button>
        </div>
      }

      <!-- Its own region, apart from the page's load announcer: it also speaks each appended page. -->
      <p class="sr-only" role="status" aria-live="polite" data-testid="venue-reviews-status">
        {{ status() }}
      </p>
    </section>
  `,
})
export class VenueReviews {
  readonly venueId = input.required<number>();

  protected readonly cls = CLS;

  private readonly venues = inject(VenueService);
  private readonly moveFocus = focusMover();

  protected readonly entries = signal<readonly ReviewEntryView[]>([]);
  protected readonly nextCursor = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  /** True once any page has landed for the current venue — what separates "empty" from "not yet". */
  protected readonly loadedOnce = signal(false);

  /** What the live region says: the load in flight, else what has landed; silent on a failure. */
  protected readonly status = computed(() => {
    if (this.loading()) {
      return 'Loading reviews…';
    }
    if (!this.loadedOnce() || this.failed()) {
      return '';
    }
    const listed = this.entries().length;
    return listed === 0 ? 'No written reviews yet.' : `Showing ${reviewsLabel(listed)}.`;
  });

  /** The per-dispatch generation: any later dispatch or venue change supersedes this response. */
  private epoch = 0;

  constructor() {
    effect(() => {
      const id = this.venueId();
      untracked(() => this.reset(id));
    });
  }

  protected more(): void {
    const cursor = this.nextCursor();
    if (cursor !== null && !this.loading()) {
      this.fetch(cursor, false);
    }
  }

  /** After a failure: the same page again — the first, or the one "Show more" was fetching. */
  protected retry(): void {
    this.fetch(this.entries().length > 0 ? (this.nextCursor() ?? undefined) : undefined, true);
  }

  private reset(id: number): void {
    this.epoch++;
    this.entries.set([]);
    this.nextCursor.set(null);
    this.failed.set(false);
    this.loadedOnce.set(false);
    this.fetch(undefined, false, id);
  }

  private fetch(cursor: number | undefined, retrying: boolean, id = this.venueId()): void {
    const epoch = ++this.epoch;
    // A pressed control ("Show more", retry) is destroyed by either outcome; the first load pressed none.
    const pressed = retrying || cursor !== undefined;
    this.loading.set(true);
    this.failed.set(false);
    this.venues.reviews(id, cursor).subscribe({
      next: (page) => {
        if (this.epoch !== epoch) {
          return;
        }
        const added = page.reviews.map(toView);
        this.entries.update((listed) => [...listed, ...added]);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
        this.loadedOnce.set(true);
        // The pressed control is gone: the retry always, "Show more" on the last page.
        if (retrying || (pressed && page.nextCursor === null)) {
          this.moveFocus(
            added.length > 0 ? `review-entry-${added[0].id}` : 'venue-reviews-heading',
            'venue-reviews-heading',
          );
        }
      },
      error: () => {
        if (this.epoch !== epoch) {
          return;
        }
        this.loading.set(false);
        this.failed.set(true);
        if (pressed) {
          this.moveFocus('venue-reviews-error');
        }
      },
    });
  }
}

function toView(entry: VenueReviewEntry): ReviewEntryView {
  return {
    id: entry.id,
    glyphs: starGlyphs(entry.stars),
    starsLabel: starsOutOfFive(entry.stars),
    name: entry.displayName ?? ANONYMOUS,
    stayed: formatStayMonth(entry.stayedIn),
    comment: entry.comment,
  };
}
