import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { BookingStatus } from '../shared/booking-status';
import { ReviewPanel as ReviewPanelState, SubmitReviewRequest } from './booking.model';
import { ReviewPanel } from './review-panel';

/**
 * The panel's own contract: which of the six review sections it renders, what each one says, and
 * what it hands upstairs when the guest writes, changes or removes a review. The booking view's
 * spec covers the HTTP and the result region behind these outputs; nothing here talks to a server.
 *
 * The window deadline is a fixed instant, so the rendered wall-clock label is deterministic in
 * `Europe/Tirane` (invariant #6) rather than the runner's zone.
 */
describe('ReviewPanel', () => {
  const CLOSES_AT = '2026-09-29T16:00:00Z';
  const OWN = { stars: 4, comment: 'Great sunbeds', displayName: 'Ana' };

  const ELIGIBLE: ReviewPanelState = {
    kind: 'ELIGIBLE',
    windowClosesAt: CLOSES_AT,
    nameSuggestion: 'Ana',
  };
  const ALREADY_REVIEWED: ReviewPanelState = {
    kind: 'ALREADY_REVIEWED',
    review: OWN,
    windowClosesAt: CLOSES_AT,
  };

  interface Rendered {
    readonly fixture: ComponentFixture<ReviewPanel>;
    readonly host: HTMLElement;
    readonly submitted: SubmitReviewRequest[];
    readonly updated: SubmitReviewRequest[];
    readonly deleted: number[];
    readonly blocked: string[];
    click(testId: string): void;
    type(testId: string, value: string): void;
    find(testId: string): HTMLElement | null;
  }

  function render(
    panel: ReviewPanelState,
    status: BookingStatus = 'COMPLETED',
    busy = false,
  ): Rendered {
    const fixture = TestBed.createComponent(ReviewPanel);
    fixture.componentRef.setInput('panel', panel);
    fixture.componentRef.setInput('bookingStatus', status);
    fixture.componentRef.setInput('venueName', 'Miramar Beach Club');
    fixture.componentRef.setInput('busy', busy);
    const submitted: SubmitReviewRequest[] = [];
    const updated: SubmitReviewRequest[] = [];
    const deleted: number[] = [];
    const blocked: string[] = [];
    fixture.componentInstance.submitted.subscribe((r) => submitted.push(r));
    fixture.componentInstance.updated.subscribe((r) => updated.push(r));
    fixture.componentInstance.deleted.subscribe(() => deleted.push(1));
    fixture.componentInstance.blocked.subscribe((m) => blocked.push(m));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const find = (testId: string) => host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    return {
      fixture,
      host,
      submitted,
      updated,
      deleted,
      blocked,
      find,
      click: (testId: string) => {
        find(testId)!.click();
        fixture.detectChanges();
      },
      type: (testId: string, value: string) => {
        const field = find(testId) as HTMLInputElement | HTMLTextAreaElement;
        field.value = value;
        field.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      },
    };
  }

  describe('ELIGIBLE', () => {
    it('renders the form with the name prefilled from the server suggestion', async () => {
      const r = render(ELIGIBLE);

      expect(r.find('review-panel')).not.toBeNull();
      expect((r.find('review-display-name') as HTMLInputElement).value).toBe('Ana');
      expect(r.host.querySelectorAll('[data-testid^="star-"]')).toHaveLength(5);
      expect(r.host.textContent).toContain('Miramar Beach Club');
      await expectNoAxeViolations(r.host);
    });

    it('starts with an empty name when the server suggests none', () => {
      const r = render({ ...ELIGIBLE, nameSuggestion: null });

      expect((r.find('review-display-name') as HTMLInputElement).value).toBe('');
    });

    it('states the deadline for changing the review in Europe/Tirane', () => {
      const r = render(ELIGIBLE);

      expect(r.find('review-panel')?.textContent).toContain('18:00');
    });

    it('emits the written review, with a blank comment sent as none', () => {
      const r = render(ELIGIBLE);

      r.click('star-4');
      r.click('submit-review');

      expect(r.submitted).toEqual([{ stars: 4, comment: null, displayName: 'Ana' }]);
      expect(r.blocked).toEqual([]);
    });

    it('emits the comment the guest wrote, trimmed', () => {
      const r = render(ELIGIBLE);

      r.click('star-5');
      r.type('review-comment', '  Great sunbeds  ');
      r.click('submit-review');

      expect(r.submitted).toEqual([{ stars: 5, comment: 'Great sunbeds', displayName: 'Ana' }]);
    });

    it('sends nothing and funnels the required message when no star is picked', () => {
      const r = render(ELIGIBLE);

      r.click('submit-review');

      expect(r.submitted).toEqual([]);
      expect(r.blocked).toEqual(['Pick a star rating.']);
    });

    it('refuses a comment over the bound with an inline error, and sends nothing', () => {
      const r = render(ELIGIBLE);

      r.click('star-4');
      r.type('review-comment', 'x'.repeat(1001));
      r.click('submit-review');

      expect(r.submitted).toEqual([]);
      expect(r.find('review-comment-error')?.textContent).toContain('1000 characters');
    });

    it('refuses a blank display name with an inline error, and sends nothing', () => {
      const r = render(ELIGIBLE);

      r.click('star-4');
      r.type('review-display-name', '');
      r.click('submit-review');

      expect(r.submitted).toEqual([]);
      expect(r.find('review-display-name-error')?.textContent).toContain('name to show');
    });

    it('shows no error before the guest has tried to send', () => {
      const r = render(ELIGIBLE);

      r.type('review-display-name', '');

      expect(r.find('review-display-name-error')).toBeNull();
    });
  });

  describe('ALREADY_REVIEWED', () => {
    it('renders the stored review with its stars, name and comment', async () => {
      const r = render(ALREADY_REVIEWED);

      expect(r.find('own-review-stars')?.getAttribute('aria-label')).toBe('4 out of 5 stars');
      expect(r.find('own-review-name')?.textContent).toContain('Ana');
      expect(r.find('own-review-comment')?.textContent).toContain('Great sunbeds');
      expect(r.find('review-comment')).toBeNull();
      await expectNoAxeViolations(r.host);
    });

    it('opens an edit form seeded from the stored review, and emits the changes', () => {
      const r = render(ALREADY_REVIEWED);

      r.click('edit-review');

      expect((r.find('review-comment') as HTMLTextAreaElement).value).toBe('Great sunbeds');
      expect((r.find('review-display-name') as HTMLInputElement).value).toBe('Ana');

      r.click('star-2');
      r.click('submit-review');

      expect(r.updated).toEqual([{ stars: 2, comment: 'Great sunbeds', displayName: 'Ana' }]);
      expect(r.submitted).toEqual([]);
    });

    it('cancelling an edit restores the stored review without emitting anything', () => {
      const r = render(ALREADY_REVIEWED);

      r.click('edit-review');
      r.click('star-1');
      r.click('cancel-edit-review');

      expect(r.updated).toEqual([]);
      expect(r.find('own-review-stars')?.getAttribute('aria-label')).toBe('4 out of 5 stars');

      r.click('edit-review');
      expect((r.find('review-comment') as HTMLTextAreaElement).value).toBe('Great sunbeds');
    });

    it('asks before removing the review, and emits only once confirmed', async () => {
      const r = render(ALREADY_REVIEWED);

      r.click('start-delete-review');
      expect(r.find('confirm-delete-question')?.textContent).toContain('cannot be undone');
      expect(r.deleted).toEqual([]);
      await expectNoAxeViolations(r.host);

      r.click('confirm-delete-review');
      expect(r.deleted).toEqual([1]);
    });

    it('keeping the review closes the confirmation without emitting', () => {
      const r = render(ALREADY_REVIEWED);

      r.click('start-delete-review');
      r.click('keep-review');

      expect(r.deleted).toEqual([]);
      expect(r.find('confirm-delete-question')).toBeNull();
      expect(r.find('start-delete-review')).not.toBeNull();
    });

    it('moves focus into the form when the edit opens, and back when it is cancelled', async () => {
      const r = render(ALREADY_REVIEWED);

      r.click('edit-review');
      await r.fixture.whenStable();
      expect(document.activeElement).toBe(r.find('review-comment'));

      r.click('cancel-edit-review');
      await r.fixture.whenStable();
      expect(document.activeElement).toBe(r.find('edit-review'));
    });

    it('will not take back a removal that is already in flight', () => {
      const r = render(ALREADY_REVIEWED, 'COMPLETED', true);

      r.click('start-delete-review');
      r.click('keep-review');

      expect(r.find('confirm-delete-question')).not.toBeNull();
    });

    it('will not cancel an edit whose save is already in flight', () => {
      const r = render(ALREADY_REVIEWED, 'COMPLETED', true);

      r.click('edit-review');
      r.click('cancel-edit-review');

      expect(r.find('review-comment')).not.toBeNull();
    });

    it('settling a landed write closes the edit form without a new panel', () => {
      const r = render(ALREADY_REVIEWED);

      r.click('edit-review');
      r.fixture.componentInstance.settle();
      r.fixture.detectChanges();

      expect(r.find('review-comment')).toBeNull();
      expect(r.find('own-review')).not.toBeNull();
    });
  });

  describe('FROZEN', () => {
    it('renders the review read-only and says why it can no longer change', async () => {
      const r = render({ kind: 'FROZEN', review: OWN });

      expect(r.find('own-review-comment')?.textContent).toContain('Great sunbeds');
      expect(r.find('review-frozen-note')?.textContent).toContain('60 days');
      expect(r.find('edit-review')).toBeNull();
      expect(r.find('start-delete-review')).toBeNull();
      expect(r.find('review-comment')).toBeNull();
      await expectNoAxeViolations(r.host);
    });

    it('renders a star-only review without an empty name or comment line', () => {
      const r = render({
        kind: 'FROZEN',
        review: { stars: 3, comment: null, displayName: null },
      });

      expect(r.find('own-review-stars')?.getAttribute('aria-label')).toBe('3 out of 5 stars');
      expect(r.find('own-review-name')).toBeNull();
      expect(r.find('own-review-comment')).toBeNull();
    });
  });

  describe('WINDOW_CLOSED', () => {
    it('says the window has closed and offers nothing to write', async () => {
      const r = render({ kind: 'WINDOW_CLOSED' });

      expect(r.find('review-window-closed-note')?.textContent).toContain('window has closed');
      expect(r.find('own-review')).toBeNull();
      expect(r.find('review-comment')).toBeNull();
      await expectNoAxeViolations(r.host);
    });
  });

  describe('NOT_COMPLETED', () => {
    it('invites a confirmed guest to rate the stay once they are checked in', async () => {
      const r = render({ kind: 'NOT_COMPLETED' }, 'CONFIRMED');

      expect(r.find('review-not-completed-note')?.textContent).toContain('checked you in');
      await expectNoAxeViolations(r.host);
    });

    it('renders nothing for a stay that ended without a check-in', () => {
      for (const status of ['CANCELLED', 'NO_SHOW', 'WITHDRAWN'] as BookingStatus[]) {
        const r = render({ kind: 'NOT_COMPLETED' }, status);

        expect(r.find('review-panel'), status).toBeNull();
      }
    });
  });
});
