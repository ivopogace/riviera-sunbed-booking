import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminCommissionsService } from './admin-commissions.service';
import { AdminOperators } from './admin-operators';
import { AdminOperatorsService } from './admin-operators.service';
import { OperatorAccountView, PendingOperatorView, VenueCommissionView } from './admin.model';

/**
 * Structural axe audit of the admin operator surface: two titled regions —
 * the pending-registration queue with approve/reject controls, and the account list with
 * suspend/reinstate. Rendered as a signed-in admin with one row in each. Contrast is not measurable by
 * axe under jsdom; it is proven in the e2e.
 *
 * <p>The page also carries the console stat strip, audited here in <strong>both</strong>
 * of its states — with its numbers and with every tile dashed, which is a different DOM (the Venues
 * tile drops its sub-caption and the strip drops its note) and therefore a separate audit.
 */
const rows: PendingOperatorView[] = [
  { id: 7, username: 'alice', contactEmail: 'a@v.example', registeredAt: '2026-07-18T00:00:00Z' },
];

const accountRows: OperatorAccountView[] = [
  { id: 11, username: 'carla', contactEmail: 'c@v.example', admin: false, suspended: false },
  { id: 12, username: 'dan', contactEmail: null, admin: false, suspended: true },
];

const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

const serviceStub: Partial<AdminOperatorsService> = {
  pending: () => Promise.resolve(rows),
  accounts: () => Promise.resolve(accountRows),
};

const VENUES = [
  {
    venueId: 7,
    name: 'Bora Bora Beach',
    beach: 'Dhërmi',
    commissionBps: 1500,
    payoutCurrency: 'EUR',
  },
];

async function render(
  venues: () => Promise<readonly VenueCommissionView[]> = () => Promise.resolve(VENUES),
): Promise<ComponentFixture<AdminOperators>> {
  await TestBed.configureTestingModule({
    imports: [AdminOperators],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminOperatorsService, useValue: serviceStub },
      { provide: AdminCommissionsService, useValue: { venues } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminOperators);
  fixture.detectChanges();
  // Settled twice: the load awaits BOTH lists (Promise.all), so one microtask turn isn't enough.
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminOperators accessibility (axe)', () => {
  it('exposes titled regions for both the pending queue and the account list', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#admin-ops-title')?.textContent).toContain('Operators');
    expect(host.querySelector('[data-testid="admin-ops-list"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="admin-approve-7"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="admin-reject-7"]')).not.toBeNull();

    expect(host.querySelector('[data-testid="admin-accounts-list"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="admin-suspend-11"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="admin-reinstate-12"]')).not.toBeNull();
  });

  it('has no critical/serious violations with both lists populated', async () => {
    const fixture = await render();
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no critical/serious violations with a suspension armed', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="admin-suspend-11"]')!.click();
    fixture.detectChanges();

    // The inline confirmation replaces the trigger in place — axe must still pass in that state.
    expect(host.querySelector('[data-testid="admin-suspend-confirm-11"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('has no critical/serious violations with the stat strip populated', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="admin-stat-mean-rate"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('has no critical/serious violations with every stat tile dashed', async () => {
    const fixture = await render(() => Promise.reject(new Error('offline')));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="admin-stat-venues"]')?.textContent?.trim()).toBe('—');
    expect(host.querySelector('[data-testid="admin-stats-mean-note"]')).toBeNull();
    await expectNoAxeViolations(host);
  });
});
