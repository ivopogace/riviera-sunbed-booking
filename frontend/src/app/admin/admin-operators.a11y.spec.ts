import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminOperators } from './admin-operators';
import { AdminOperatorsService } from './admin-operators.service';
import { OperatorAccountView, PendingOperatorView } from './admin.model';

/**
 * Structural axe audit of the admin operator surface (S6 #115, extended #128): two titled regions —
 * the pending-registration queue with approve/reject controls, and the account list with
 * suspend/reinstate. Rendered as a signed-in admin with one row in each. Contrast is not measurable by
 * axe under jsdom; it is proven in the e2e.
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
  pending: async () => rows,
  accounts: async () => accountRows,
};

async function render(): Promise<ComponentFixture<AdminOperators>> {
  await TestBed.configureTestingModule({
    imports: [AdminOperators],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminOperatorsService, useValue: serviceStub },
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

    (host.querySelector('[data-testid="admin-suspend-11"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    // The inline confirmation replaces the trigger in place — axe must still pass in that state.
    expect(host.querySelector('[data-testid="admin-suspend-confirm-11"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });
});
