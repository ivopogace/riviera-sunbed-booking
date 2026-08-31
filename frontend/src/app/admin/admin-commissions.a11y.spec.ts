import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminCommissions } from './admin-commissions';
import { AdminCommissionsService } from './admin-commissions.service';
import { VenueCommissionView } from './admin.model';

/**
 * Structural axe audit of the admin console's Commissions tab: the tab strip, the
 * venue cards, the explainer's heading hierarchy (an `h2` over six `h3` sections under the page's
 * one `h1`), the polite live region, and — with the editor open — two labelled fields.
 *
 * <p>Audited in three states — closed, editor open, and editor showing a validation error. The
 * error element is mounted only while the error exists, so its association with the rate field
 * lasts exactly as long as the error does (#826); the earlier always-mounted alert region is gone.
 * The open and erroring states are where the extra semantics live, and they are what an admin
 * actually reads before moving a commercial term. Contrast is not measurable by axe under jsdom;
 * the e2e proves it against a real render.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

const VENUES: readonly VenueCommissionView[] = [
  {
    venueId: 7,
    name: 'Bora Bora Beach',
    beach: 'Dhërmi',
    commissionBps: 1500,
    payoutCurrency: 'EUR',
  },
  { venueId: 9, name: 'Folie Marine', beach: 'Gjipe', commissionBps: 1000, payoutCurrency: 'EUR' },
];

function serviceStub(): Partial<AdminCommissionsService> {
  return {
    venues: () => Promise.resolve(VENUES),
    setCommission: (venueId: number, commissionBps: number) =>
      Promise.resolve({
        ...VENUES.find((venue) => venue.venueId === venueId)!,
        commissionBps,
      }),
  };
}

async function settle(fixture: ComponentFixture<AdminCommissions>): Promise<void> {
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function renderTab(): Promise<ComponentFixture<AdminCommissions>> {
  await TestBed.configureTestingModule({
    imports: [AdminCommissions],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminCommissionsService, useValue: serviceStub() },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminCommissions);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

describe('AdminCommissions a11y', () => {
  it('has no axe violations listing the venues and their rates', async () => {
    const fixture = await renderTab();

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no axe violations while a rate editor is open', async () => {
    const fixture = await renderTab();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('[data-testid="admin-commission-edit-7"]')!
      .click();
    fixture.detectChanges();
    await settle(fixture);

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  /** The third state: the one that carries the extra semantics an association adds. */
  it('has no axe violations while a rate editor shows a validation error', async () => {
    const fixture = await renderTab();
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLElement>('[data-testid="admin-commission-edit-7"]')!.click();
    fixture.detectChanges();
    await settle(fixture);
    const field = host.querySelector<HTMLInputElement>(
      '[data-testid="admin-commission-percent-7"]',
    )!;
    field.value = '101';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    host.querySelector<HTMLElement>('[data-testid="admin-commission-save-7"]')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(host.querySelector('[data-testid="admin-commission-percent-error-7"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });
});
