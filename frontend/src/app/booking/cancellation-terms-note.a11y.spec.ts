import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';

import { expectNoAxeViolations } from '../../testing/axe';
import { CancellationTerms } from './booking.model';
import { CancellationTermsNote } from './cancellation-terms-note';

/**
 * Structural axe audit of the async-loaded disclosure (#795, R-6): the note sits inside a polite
 * live region (`role="status"`), so a screen reader hears the terms when they resolve after the
 * dialog opened. Contrast is the call site's (the note carries no ink of its own); the real
 * render-in-a-browser proof is the mocked e2e.
 */
@Component({
  imports: [CancellationTermsNote],
  template: `<div role="status"><p appCancellationTermsNote [terms]="terms"></p></div>`,
})
class HostStub {
  terms: CancellationTerms = {
    window: 'CLOSED',
    freeCancellationEndsAt: '2026-08-29T16:00:00Z',
    lateCancelRefundBps: 0,
  };
}

describe('CancellationTermsNote accessibility (axe)', () => {
  let fixture: ComponentFixture<HostStub>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostStub] }).compileComponents();
    fixture = TestBed.createComponent(HostStub);
    fixture.detectChanges();
  });

  it('renders the disclosure inside a polite live region with no axe violations', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const region = host.querySelector('[role="status"]');
    expect(region?.querySelector('[data-testid="cancellation-terms-note"]')?.textContent).toContain(
      'Non-refundable last-minute booking',
    );
    await expectNoAxeViolations(host);
  });
});
