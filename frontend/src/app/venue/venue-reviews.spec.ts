import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { VenueReviewEntry, VenueReviewsPage } from '../shared/venue-views';
import { VenueReviews } from './venue-reviews';

/**
 * The review section's own contract: what one listed review renders as, how "Show more" appends
 * the next page and where focus lands when the control leaves, and the three states around the
 * list — loading, empty, failed. The venue page's spec only proves the section is embedded.
 */
describe('VenueReviews', () => {
  let httpMock: HttpTestingController;

  const ANA: VenueReviewEntry = {
    id: 41,
    stars: 4,
    displayName: 'Ana',
    stayedIn: '2026-07',
    comment: 'Great sunbeds, calm sea.',
  };
  const BEN: VenueReviewEntry = {
    ...ANA,
    id: 40,
    stars: 5,
    displayName: 'Ben',
    comment: 'Perfect.',
  };
  const CLARA: VenueReviewEntry = {
    ...ANA,
    id: 39,
    stars: 3,
    displayName: 'Clara',
    comment: 'Fine.',
  };

  interface Rendered {
    readonly fixture: ComponentFixture<VenueReviews>;
    readonly host: HTMLElement;
    find(testId: string): HTMLElement | null;
    entries(): HTMLElement[];
    click(testId: string): void;
    /** Answer the pending reviews request for `venueId`, asserting the cursor it carried. */
    flush(page: VenueReviewsPage, cursor?: number, venueId?: number): Promise<void>;
    fail(): Promise<void>;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueReviews],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    document.body.innerHTML = '';
  });

  function render(venueId = 1): Rendered {
    const fixture = TestBed.createComponent(VenueReviews);
    fixture.componentRef.setInput('venueId', venueId);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    // Attached, so focus moves are observable through document.activeElement.
    document.body.appendChild(host);
    const find = (testId: string) => host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    return {
      fixture,
      host,
      find,
      entries: () =>
        Array.from(host.querySelectorAll<HTMLElement>('[data-testid^="review-entry-"]')),
      click: (testId: string) => {
        find(testId)!.click();
        fixture.detectChanges();
      },
      flush: async (page, cursor, id = venueId) => {
        const request = httpMock.expectOne(
          (req) => req.url === `${environment.apiBaseUrl}/api/venues/${id}/reviews`,
        );
        expect(request.request.params.get('cursor')).toBe(
          cursor === undefined ? null : `${cursor}`,
        );
        request.flush(page);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      },
      fail: async () => {
        httpMock
          .expectOne((req) => req.url.endsWith(`/api/venues/${venueId}/reviews`))
          .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  it('renders each listed review with its stars announced, its name, its stay month and its words', async () => {
    const r = render();
    expect(r.find('venue-reviews-loading')).not.toBeNull();

    await r.flush({ reviews: [ANA, BEN], nextCursor: null });

    expect(r.entries()).toHaveLength(2);
    const first = r.entries()[0];
    expect(first.getAttribute('data-testid')).toBe('review-entry-41');
    const stars = first.querySelector('[data-testid="review-stars"]')!;
    expect(stars.getAttribute('role')).toBe('img');
    expect(stars.getAttribute('aria-label')).toBe('4 out of 5 stars');
    expect(stars.textContent?.trim()).toBe('★★★★☆');
    expect(first.querySelector('[data-testid="review-name"]')?.textContent?.trim()).toBe('Ana');
    expect(first.querySelector('[data-testid="review-stay"]')?.textContent).toContain('July 2026');
    expect(first.querySelector('[data-testid="review-stay"]')?.textContent).not.toContain(
      '2026-07-',
    );
    expect(first.querySelector('[data-testid="review-comment"]')?.textContent?.trim()).toBe(
      'Great sunbeds, calm sea.',
    );
    expect(r.find('venue-reviews-more')).toBeNull();
    expect(r.find('venue-reviews-loading')).toBeNull();
    expect(r.find('venue-reviews-status')?.textContent).toContain('Showing 2 reviews');
  });

  it('"Show more" asks for the page after the cursor and appends it below the first', async () => {
    const r = render();
    await r.flush({ reviews: [ANA], nextCursor: 41 });
    expect(r.find('venue-reviews-more')).not.toBeNull();

    r.click('venue-reviews-more');
    expect(r.find('venue-reviews-more')?.getAttribute('aria-disabled')).toBe('true');
    await r.flush({ reviews: [BEN], nextCursor: 40 }, 41);

    expect(r.entries().map((e) => e.getAttribute('data-testid'))).toEqual([
      'review-entry-41',
      'review-entry-40',
    ]);
    expect(r.find('venue-reviews-more')).not.toBeNull();
    expect(r.find('venue-reviews-more')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('on the last page the control leaves and focus lands on the first newly-listed review', async () => {
    const r = render();
    await r.flush({ reviews: [ANA], nextCursor: 41 });

    r.click('venue-reviews-more');
    await r.flush({ reviews: [BEN, CLARA], nextCursor: null }, 41);

    expect(r.find('venue-reviews-more')).toBeNull();
    expect(r.entries()).toHaveLength(3);
    expect(document.activeElement).toBe(r.find('review-entry-40'));
  });

  it('attributes a review without a display name to "A guest"', async () => {
    const r = render();

    await r.flush({ reviews: [{ ...ANA, displayName: null }], nextCursor: null });

    expect(r.find('review-name')?.textContent?.trim()).toBe('A guest');
  });

  it('renders the quiet empty state on an empty first page', async () => {
    const r = render();

    await r.flush({ reviews: [], nextCursor: null });

    expect(r.find('venue-reviews-empty')?.textContent).toContain('No written reviews yet');
    expect(r.find('venue-reviews-list')).toBeNull();
    expect(r.find('venue-reviews-more')).toBeNull();
  });

  it('shows the failure line with a retry that re-fetches, and focuses the list once it lands', async () => {
    const r = render();
    await r.fail();
    expect(r.find('venue-reviews-error')?.textContent).toContain('couldn’t be loaded');
    expect(r.find('venue-reviews-empty')).toBeNull();

    r.click('venue-reviews-retry');
    await r.flush({ reviews: [ANA], nextCursor: null });

    expect(r.find('venue-reviews-error')).toBeNull();
    expect(r.entries()).toHaveLength(1);
    expect(document.activeElement).toBe(r.find('review-entry-41'));
  });

  it('a failed "Show more" keeps what was listed and retries from the same cursor', async () => {
    const r = render();
    await r.flush({ reviews: [ANA], nextCursor: 41 });
    r.click('venue-reviews-more');
    await r.fail();

    expect(r.entries()).toHaveLength(1);
    expect(r.find('venue-reviews-error')).not.toBeNull();
    expect(r.find('venue-reviews-more')).toBeNull();

    r.click('venue-reviews-retry');
    await r.flush({ reviews: [BEN], nextCursor: null }, 41);

    expect(r.entries()).toHaveLength(2);
  });

  it("starts over for a new venue id, ignoring the old venue's late answer", async () => {
    const r = render(1);
    await r.flush({ reviews: [ANA], nextCursor: 41 });

    r.fixture.componentRef.setInput('venueId', 2);
    r.fixture.detectChanges();

    expect(r.entries()).toHaveLength(0);
    await r.flush({ reviews: [CLARA], nextCursor: null }, undefined, 2);
    expect(r.entries().map((e) => e.getAttribute('data-testid'))).toEqual(['review-entry-39']);
  });
});
