import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminPrivacy } from './admin-privacy';
import { AdminPrivacyService } from './admin-privacy.service';

/**
 * Structural axe audit of the admin console's Privacy tab (A3, epic #348), at **each of the three
 * stages** — the form, the armed confirmation, and the outcome — because the panels replace one
 * another in place, so two thirds of this surface's semantics never exist at the same time as the
 * rest. What is audited per stage: the tab strip, the labelled erasure card and its aside, the
 * labelled email field with its error region, and the two focusable `role="group"` panels that carry
 * `aria-labelledby` because focus lands on them (which is what makes each swap announce).
 *
 * <p>Contrast is not measurable by axe under jsdom; the e2e proves it against a real render.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

function serviceStub(): Partial<AdminPrivacyService> {
  return { erase: async () => undefined };
}

async function settle(fixture: ComponentFixture<AdminPrivacy>): Promise<void> {
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function renderTab(): Promise<ComponentFixture<AdminPrivacy>> {
  await TestBed.configureTestingModule({
    imports: [AdminPrivacy],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminPrivacyService, useValue: serviceStub() },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminPrivacy);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

function click(fixture: ComponentFixture<AdminPrivacy>, testId: string): void {
  fixture.nativeElement.querySelector(`[data-testid="${testId}"]`).click();
  fixture.detectChanges();
}

/** Fill the address and arm the confirmation — the only way to reach the later two stages. */
async function armConfirmation(fixture: ComponentFixture<AdminPrivacy>): Promise<void> {
  const field: HTMLInputElement = fixture.nativeElement.querySelector(
    '[data-testid="admin-privacy-email"]',
  );
  field.value = 'ana@example.com';
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  click(fixture, 'admin-privacy-review');
  await settle(fixture);
}

describe('AdminPrivacy a11y', () => {
  it('has no axe violations on the erasure form', async () => {
    const fixture = await renderTab();

    await expectNoAxeViolations(fixture.nativeElement);
  });

  it('has no axe violations while a confirmation is armed', async () => {
    const fixture = await renderTab();

    await armConfirmation(fixture);

    await expectNoAxeViolations(fixture.nativeElement);
  });

  it('has no axe violations on the outcome', async () => {
    const fixture = await renderTab();

    await armConfirmation(fixture);
    click(fixture, 'admin-privacy-confirm');
    await settle(fixture);

    await expectNoAxeViolations(fixture.nativeElement);
  });
});
