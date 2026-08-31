import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { PendingApprovalBanner } from './pending-approval-banner';

describe('PendingApprovalBanner a11y (#694)', () => {
  it('has no violations while showing the pending notice', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: OperatorAuth, useValue: { pendingApproval: signal(true) } }],
    });
    const fixture = TestBed.createComponent(PendingApprovalBanner);
    await fixture.whenStable();
    fixture.detectChanges();

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});
