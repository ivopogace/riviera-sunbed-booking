import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminReviews } from './admin-reviews';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminVenuesService } from './admin-venues.service';
import { AdminReviewsPage } from './admin.model';

/**
 * Structural axe audit of the admin console's Reviews tab: the labelled venue picker, the review
 * rows (stars as a labelled image, the hidden chip, the per-row action), the polite live region —
 * audited with the hide confirmation open as well, since that state adds the prompt, the reason
 * field and two more buttons in place. Contrast is the e2e's, against a real render.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

const PAGE: AdminReviewsPage = {
  reviews: [
    {
      id: 31,
      stars: 5,
      displayName: 'Ana',
      stayedIn: '2026-07',
      comment: 'Great sunbeds.',
      createdAt: '2026-07-02T08:00:00Z',
      hiddenAt: null,
    },
    {
      id: 30,
      stars: 1,
      displayName: null,
      stayedIn: '2026-07',
      comment: null,
      createdAt: '2026-07-01T18:00:00Z',
      hiddenAt: '2026-07-03T09:00:00Z',
    },
  ],
  nextCursor: 30,
};

async function settle(fixture: ComponentFixture<AdminReviews>): Promise<void> {
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function renderWithVenuePicked(): Promise<ComponentFixture<AdminReviews>> {
  await TestBed.configureTestingModule({
    imports: [AdminReviews],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      {
        provide: AdminVenuesService,
        useValue: {
          venues: () => Promise.resolve([{ id: 7, name: 'Bora Bora Beach', beach: 'Dhërmi' }]),
        },
      },
      {
        provide: AdminReviewsService,
        useValue: {
          reviews: () => Promise.resolve(PAGE),
          hide: () => Promise.resolve(undefined),
          unhide: () => Promise.resolve(undefined),
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminReviews);
  fixture.detectChanges();
  await settle(fixture);

  const select: HTMLSelectElement = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-testid="admin-reviews-venue"]',
  )!;
  select.value = '7';
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

describe('AdminReviews a11y', () => {
  it('has no axe violations showing a venue’s reviews, hidden one marked', async () => {
    const fixture = await renderWithVenuePicked();

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no axe violations while a hide confirmation is open', async () => {
    const fixture = await renderWithVenuePicked();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('[data-testid="admin-review-hide-31"]')!
      .click();
    fixture.detectChanges();

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});
