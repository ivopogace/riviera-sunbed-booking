import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminCommissions } from './admin-commissions';
import { AdminCommissionsService } from './admin-commissions.service';
import { VenueCommissionView } from './admin.model';

/**
 * Structural axe audit of the admin console's Commissions tab (A8, epic #348): the tab strip, the
 * venue cards, the explainer's heading hierarchy (an `h2` over six `h3` sections under the page's
 * one `h1`), the polite live region, and — with the editor open — two labelled fields and an alert
 * region that exists before it ever carries text.
 *
 * <p>Audited **with the editor open** as well as closed, because that is where the extra semantics
 * live and it is the state an admin actually reads before moving a commercial term. Contrast is not
 * measurable by axe under jsdom; the e2e proves it against a real render.
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
    venues: async () => VENUES,
    setCommission: async (venueId: number, commissionBps: number) => ({
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

    await expectNoAxeViolations(fixture.nativeElement);
  });

  it('has no axe violations while a rate editor is open', async () => {
    const fixture = await renderTab();

    fixture.nativeElement.querySelector('[data-testid="admin-commission-edit-7"]').click();
    fixture.detectChanges();
    await settle(fixture);

    await expectNoAxeViolations(fixture.nativeElement);
  });
});
