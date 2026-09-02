import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Mock, vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminReviews } from './admin-reviews';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminVenuesService } from './admin-venues.service';
import { AdminReviewEntryView, AdminReviewsPage } from './admin.model';

/**
 * The admin console's Reviews tab — the surface that makes the review takedown usable. What
 * matters: an admin sees every review of a venue it does not own with the hidden ones marked, a
 * hide cannot happen on one click and carries its grounds, an un-hide is one press because it
 * restores rather than destroys, focus never strands, and a non-admin never loads a thing.
 */
interface AuthState {
  restoring?: boolean;
  signedIn?: boolean;
  isAdmin?: boolean;
}

function authStub(state: AuthState = {}): OperatorAuth {
  return {
    restoring: signal(state.restoring ?? false),
    signedIn: signal(state.signedIn ?? true),
    isAdmin: signal(state.isAdmin ?? true),
    principalName: signal('admin-self'),
  } as unknown as OperatorAuth;
}

const VENUES = [
  { id: 7, name: 'Bora Bora Beach', beach: 'Dhërmi' },
  { id: 9, name: 'Folie Marine', beach: 'Gjipe' },
];

function entry(id: number, overrides: Partial<AdminReviewEntryView> = {}): AdminReviewEntryView {
  return {
    id,
    stars: 4,
    displayName: `Guest ${id}`,
    stayedIn: '2026-07',
    comment: `Comment ${id}`,
    createdAt: '2026-07-02T08:00:00Z',
    hiddenAt: null,
    ...overrides,
  };
}

/** Venue 7's page: a visible commented review, a hidden one, and a star-only one. */
const PAGE: AdminReviewsPage = {
  reviews: [
    entry(31, { displayName: 'Ana', comment: 'Great sunbeds.' }),
    entry(30, { displayName: 'Ben', stars: 1, comment: 'Spam', hiddenAt: '2026-07-03T09:00:00Z' }),
    entry(29, { displayName: null, stars: 3, comment: null }),
  ],
  nextCursor: null,
};

function venuesStub(): { venues: Mock<AdminVenuesService['venues']> } {
  return { venues: vi.fn(() => Promise.resolve(VENUES)) };
}

function serviceStub(): {
  reviews: Mock<AdminReviewsService['reviews']>;
  hide: Mock<AdminReviewsService['hide']>;
  unhide: Mock<AdminReviewsService['unhide']>;
} {
  return {
    reviews: vi.fn(() => Promise.resolve(PAGE)),
    hide: vi.fn(() => Promise.resolve(undefined)),
    unhide: vi.fn(() => Promise.resolve(undefined)),
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settle(fixture: ComponentFixture<AdminReviews>): Promise<void> {
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function render(
  auth: OperatorAuth,
  service: ReturnType<typeof serviceStub>,
  venues: ReturnType<typeof venuesStub> = venuesStub(),
): Promise<ComponentFixture<AdminReviews>> {
  await TestBed.configureTestingModule({
    imports: [AdminReviews],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: auth },
      { provide: AdminVenuesService, useValue: venues },
      { provide: AdminReviewsService, useValue: service },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminReviews);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

function byTestId<T extends HTMLElement>(
  fixture: ComponentFixture<AdminReviews>,
  id: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
}

function click(fixture: ComponentFixture<AdminReviews>, id: string): void {
  byTestId<HTMLButtonElement>(fixture, id)!.click();
  fixture.detectChanges();
}

async function pickVenue(fixture: ComponentFixture<AdminReviews>, venueId: number): Promise<void> {
  const select = byTestId<HTMLSelectElement>(fixture, 'admin-reviews-venue')!;
  select.value = Number.isNaN(venueId) ? '' : String(venueId);
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
  await settle(fixture);
}

describe('AdminReviews', () => {
  it('renders every review of the venue, hidden and star-only ones marked', async () => {
    const fixture = await render(authStub(), serviceStub());

    await pickVenue(fixture, 7);

    expect(byTestId(fixture, 'admin-review-31')).not.toBeNull();
    expect(byTestId(fixture, 'admin-review-stars-31')?.getAttribute('aria-label')).toBe(
      '4 out of 5 stars',
    );
    expect(byTestId(fixture, 'admin-review-name-31')?.textContent).toContain('Ana');
    expect(byTestId(fixture, 'admin-review-comment-31')?.textContent).toContain('Great sunbeds.');
    expect(byTestId(fixture, 'admin-review-hidden-31')).toBeNull();
    expect(byTestId(fixture, 'admin-review-hide-31')).not.toBeNull();

    expect(byTestId(fixture, 'admin-review-hidden-30')?.textContent).toContain('Hidden since');
    expect(byTestId(fixture, 'admin-review-hide-30')).toBeNull();
    expect(byTestId(fixture, 'admin-review-unhide-30')).not.toBeNull();

    expect(byTestId(fixture, 'admin-review-name-29')?.textContent).toContain('A guest');
    expect(byTestId(fixture, 'admin-review-comment-29')).toBeNull();
    expect(byTestId(fixture, 'admin-review-no-comment-29')).not.toBeNull();
    expect(byTestId(fixture, 'admin-reviews-more')).toBeNull();
  });

  it('requires a confirmation naming the review before hiding, and passes the typed grounds', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    click(fixture, 'admin-review-hide-31');

    expect(service.hide).not.toHaveBeenCalled();
    const prompt = byTestId(fixture, 'admin-review-confirm-prompt-31');
    expect(prompt?.textContent).toContain('Ana');
    expect(prompt?.textContent).toContain('Bora Bora Beach');
    expect(prompt?.textContent).not.toContain('cannot be undone');

    const input = byTestId<HTMLInputElement>(fixture, 'admin-review-reason-31')!;
    input.value = '  reported by the venue  ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click(fixture, 'admin-review-confirm-31');
    await settle(fixture);

    expect(service.hide).toHaveBeenCalledWith(31, 'reported by the venue');
    expect(byTestId(fixture, 'admin-review-hidden-31')?.textContent).toContain('Hidden since');
    expect(byTestId(fixture, 'admin-review-unhide-31')).not.toBeNull();
    expect(byTestId(fixture, 'admin-reviews-notice')?.textContent).toContain('Hid Ana’s review');
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-review-31'));
  });

  it('hides without grounds when none were typed, and never carries a reason into the next hide', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    click(fixture, 'admin-review-hide-31');
    const input = byTestId<HTMLInputElement>(fixture, 'admin-review-reason-31')!;
    input.value = 'first grounds';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click(fixture, 'admin-review-cancel-31');

    click(fixture, 'admin-review-hide-31');
    expect(byTestId<HTMLInputElement>(fixture, 'admin-review-reason-31')!.value).toBe('');
    click(fixture, 'admin-review-confirm-31');
    await settle(fixture);

    expect(service.hide).toHaveBeenCalledWith(31);
  });

  it('un-hides on one press — restoring needs no confirmation — and re-offers Hide', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    click(fixture, 'admin-review-unhide-30');
    await settle(fixture);

    expect(service.unhide).toHaveBeenCalledWith(30);
    expect(byTestId(fixture, 'admin-review-hidden-30')).toBeNull();
    expect(byTestId(fixture, 'admin-review-hide-30')).not.toBeNull();
    expect(byTestId(fixture, 'admin-reviews-notice')?.textContent).toContain(
      'Ben’s review is back',
    );
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-review-30'));
  });

  it('abandons a hide when the confirmation is dismissed, returning focus to Hide', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    click(fixture, 'admin-review-hide-31');
    await settle(fixture);
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-review-confirm-31'));
    click(fixture, 'admin-review-cancel-31');
    await settle(fixture);

    expect(service.hide).not.toHaveBeenCalled();
    expect(byTestId(fixture, 'admin-review-confirm-prompt-31')).toBeNull();
    expect(byTestId(fixture, 'admin-review-hidden-31')).toBeNull();
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-review-hide-31'));
  });

  it('parks focus on the notice when a hide fails, and changes nothing', async () => {
    const service = serviceStub();
    service.hide.mockRejectedValue(new Error('nope'));
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    click(fixture, 'admin-review-hide-31');
    click(fixture, 'admin-review-confirm-31');
    await settle(fixture);

    expect(byTestId(fixture, 'admin-review-confirm-31')).toBeNull();
    expect(byTestId(fixture, 'admin-review-hidden-31')).toBeNull();
    expect(byTestId(fixture, 'admin-reviews-notice')?.textContent).toContain('Could not hide');
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-reviews-notice'));
  });

  it('appends the next page behind Show more and drops the control on the last page', async () => {
    const service = serviceStub();
    service.reviews.mockImplementation((_venueId: number, cursor?: number) =>
      Promise.resolve(
        cursor === undefined
          ? { reviews: [entry(31)], nextCursor: 31 }
          : { reviews: [entry(30)], nextCursor: null },
      ),
    );
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    expect(byTestId(fixture, 'admin-review-30')).toBeNull();
    click(fixture, 'admin-reviews-more');
    await settle(fixture);

    expect(service.reviews).toHaveBeenLastCalledWith(7, 31);
    expect(byTestId(fixture, 'admin-review-31')).not.toBeNull();
    expect(byTestId(fixture, 'admin-review-30')).not.toBeNull();
    expect(byTestId(fixture, 'admin-reviews-more')).toBeNull();
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-review-30'));
  });

  it('shows an empty state for a venue nobody has reviewed', async () => {
    const service = serviceStub();
    service.reviews.mockResolvedValue({ reviews: [], nextCursor: null });
    const fixture = await render(authStub(), service);

    await pickVenue(fixture, 7);

    expect(byTestId(fixture, 'admin-reviews-empty')).not.toBeNull();
  });

  it('ignores a page that lands after the admin moved to another venue', async () => {
    const service = serviceStub();
    const slow = deferred<AdminReviewsPage>();
    service.reviews.mockImplementation((venueId: number) =>
      venueId === 7 ? slow.promise : Promise.resolve({ reviews: [entry(90)], nextCursor: null }),
    );
    const fixture = await render(authStub(), service);

    await pickVenue(fixture, 7);
    await pickVenue(fixture, 9);
    slow.resolve(PAGE);
    await settle(fixture);

    expect(byTestId(fixture, 'admin-review-90')).not.toBeNull();
    expect(byTestId(fixture, 'admin-review-31')).toBeNull();
  });

  it('does not flip a row on the venue switched to while a hide was in flight', async () => {
    const service = serviceStub();
    const slow = deferred<void>();
    service.hide.mockImplementation(() => slow.promise);
    service.reviews.mockImplementation((venueId: number) =>
      Promise.resolve(venueId === 7 ? PAGE : { reviews: [entry(31)], nextCursor: null }),
    );
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    click(fixture, 'admin-review-hide-31');
    click(fixture, 'admin-review-confirm-31');
    await pickVenue(fixture, 9);
    slow.resolve();
    await settle(fixture);

    expect(byTestId(fixture, 'admin-review-hidden-31')).toBeNull();
    expect(byTestId(fixture, 'admin-reviews-notice')?.textContent).not.toContain('Ana');
  });

  it('does not load when the admin session is not confirmed', async () => {
    const venues = venuesStub();
    await render(authStub({ isAdmin: false }), serviceStub(), venues);

    expect(venues.venues).not.toHaveBeenCalled();
  });

  it('offers a retry when the reviews fail to load', async () => {
    const service = serviceStub();
    service.reviews.mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    await pickVenue(fixture, 7);

    expect(byTestId(fixture, 'admin-reviews-error')).not.toBeNull();
    click(fixture, 'admin-reviews-retry');
    await settle(fixture);

    expect(byTestId(fixture, 'admin-reviews-error')).toBeNull();
    expect(byTestId(fixture, 'admin-review-31')).not.toBeNull();
  });
});
