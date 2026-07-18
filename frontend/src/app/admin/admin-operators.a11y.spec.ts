import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminOperators } from './admin-operators';
import { AdminOperatorsService } from './admin-operators.service';
import { PendingOperatorView } from './admin.model';

/**
 * Structural axe audit of the admin operator-approval surface (S6 #115): a titled region with a list
 * of pending registrations, each with approve/reject controls. Rendered as a signed-in admin with one
 * pending row. Contrast is not measurable by axe under jsdom; it is proven in the e2e.
 */
const rows: PendingOperatorView[] = [
  { id: 7, username: 'alice', contactEmail: 'a@v.example', registeredAt: '2026-07-18T00:00:00Z' },
];

const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
} as unknown as OperatorAuth;

const serviceStub: Partial<AdminOperatorsService> = { pending: async () => rows };

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
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminOperators accessibility (axe)', () => {
  it('exposes a titled region with a pending list and approve/reject controls', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#admin-ops-title')?.textContent).toContain('Operator registrations');
    expect(host.querySelector('[data-testid="admin-ops-list"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="admin-approve-7"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="admin-reject-7"]')).not.toBeNull();
  });

  it('has no critical/serious violations with a pending list', async () => {
    const fixture = await render();
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});
