import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminRefundOutbox } from './admin-refund-outbox';
import { AdminRefundOutboxService } from './admin-refund-outbox.service';
import { OutboxStatusView } from './admin.model';

/**
 * Structural axe audit of the admin console's Refunds tab: the tab strip, the titled card
 * with its single action, and the polite live region that announces the outcome. Rendered as a
 * signed-in admin with refunds outstanding, and again with none, since the card's body swaps between
 * the two. Contrast is not measurable by axe under jsdom; it is proven in the e2e.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

function serviceStub(status: OutboxStatusView): Partial<AdminRefundOutboxService> {
  return {
    status: async () => status,
    resubmit: async () => ({
      outcome: 'RESUBMITTED',
      resubmitted: 0,
      cooldownRemainingSeconds: 60,
    }),
  };
}

async function render(status: OutboxStatusView): Promise<ComponentFixture<AdminRefundOutbox>> {
  await TestBed.configureTestingModule({
    imports: [AdminRefundOutbox],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminRefundOutboxService, useValue: serviceStub(status) },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminRefundOutbox);
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminRefundOutbox a11y', () => {
  it('has no axe violations with refunds outstanding (AC-3)', async () => {
    const fixture = await render({ outstanding: 3, cooldownRemainingSeconds: 0 });

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no axe violations with an empty outbox (AC-3)', async () => {
    const fixture = await render({ outstanding: 0, cooldownRemainingSeconds: 0 });

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  // The outcome appears without a focus change, so only a self-announcing region reaches AT users.
  it('announces the outcome through a polite live region (AC-3)', async () => {
    const fixture = await render({ outstanding: 1, cooldownRemainingSeconds: 0 });

    const notice: HTMLElement = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="admin-refunds-notice"]',
    )!;
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.getAttribute('aria-live')).toBe('polite');
  });
});
