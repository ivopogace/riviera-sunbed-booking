import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminMailOutbox } from './admin-mail-outbox';
import { AdminMailOutboxService } from './admin-mail-outbox.service';
import { MailOutboxStatusView } from './admin.model';

/**
 * Structural axe audit of the admin console's Email tab (#405): the tab strip, the titled outbox card
 * with its single action, and the polite live region that announces the outcome. Rendered as a
 * signed-in admin with mail outstanding, and again with none, since the card's body swaps between the
 * two. Contrast is not measurable by axe under jsdom; it is proven in the e2e.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

function serviceStub(status: MailOutboxStatusView): Partial<AdminMailOutboxService> {
  return {
    status: async () => status,
    resubmit: async () => ({ outcome: 'RESUBMITTED', resubmitted: 0, cooldownRemainingSeconds: 60 }),
  };
}

async function render(status: MailOutboxStatusView): Promise<ComponentFixture<AdminMailOutbox>> {
  await TestBed.configureTestingModule({
    imports: [AdminMailOutbox],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminMailOutboxService, useValue: serviceStub(status) },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminMailOutbox);
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminMailOutbox a11y', () => {
  it('has no axe violations with mail outstanding (AC-10)', async () => {
    const fixture = await render({ outstanding: 3, cooldownRemainingSeconds: 0 });

    await expectNoAxeViolations(fixture.nativeElement);
  });

  it('has no axe violations with an empty outbox (AC-10)', async () => {
    const fixture = await render({ outstanding: 0, cooldownRemainingSeconds: 0 });

    await expectNoAxeViolations(fixture.nativeElement);
  });

  /**
   * The outcome of a press is the whole point of the screen and it appears without a focus change, so
   * a screen-reader user only learns it if the region announces itself.
   */
  it('announces the outcome through a polite live region', async () => {
    const fixture = await render({ outstanding: 1, cooldownRemainingSeconds: 0 });

    const notice: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="admin-outbox-notice"]',
    );
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.getAttribute('aria-live')).toBe('polite');
  });
});
