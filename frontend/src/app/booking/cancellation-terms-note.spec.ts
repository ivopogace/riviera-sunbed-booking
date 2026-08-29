import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import { CancellationTerms } from './booking.model';
import { CancellationTermsNote } from './cancellation-terms-note';

@Component({
  imports: [CancellationTermsNote],
  template: `<p appCancellationTermsNote [terms]="terms()"></p>`,
})
class HostStub {
  readonly terms = signal<CancellationTerms>(FREE_TERMS);
}

const FREE_TERMS: CancellationTerms = {
  window: 'FREE',
  // 18:00 Tirane on 29 Aug 2026 (CEST, UTC+2) — deliberately NOT 18:00 UTC, so a wrong zone shows.
  freeCancellationEndsAt: '2026-08-29T16:00:00Z',
  lateCancelRefundBps: 0,
};

describe('CancellationTermsNote (the pre-reserve disclosure, #795 AC-10)', () => {
  let fixture: ComponentFixture<HostStub>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostStub] }).compileComponents();
    fixture = TestBed.createComponent(HostStub);
    fixture.detectChanges();
  });

  function note(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="cancellation-terms-note"]',
    )!;
  }

  function withTerms(terms: CancellationTerms): void {
    fixture.componentInstance.terms.set(terms);
    fixture.detectChanges();
  }

  it('states free cancellation until the deadline, rendered in Europe/Tirane (R-4)', () => {
    withTerms(FREE_TERMS);
    expect(note().textContent).toContain('Free cancellation until');
    // 16:00Z is 18:00 in Tirane; asserting 18:00 pins the zone, not just the format.
    expect(note().textContent).toContain('18:00');
    expect(note().textContent).not.toContain('16:00');
  });

  it('states the partial share for LATE terms with a venue share', () => {
    withTerms({
      window: 'LATE',
      freeCancellationEndsAt: '2026-08-29T16:00:00Z',
      lateCancelRefundBps: 2250,
    });
    expect(note().textContent).toContain('refunds only 22.5%');
  });

  it('states non-refundable for LATE terms at 0 bps', () => {
    withTerms({
      window: 'LATE',
      freeCancellationEndsAt: '2026-08-29T16:00:00Z',
      lateCancelRefundBps: 0,
    });
    expect(note().textContent).toContain('no refund if cancelled');
  });

  it('states the non-refundable last-minute booking for CLOSED terms', () => {
    withTerms({
      window: 'CLOSED',
      freeCancellationEndsAt: '2026-08-29T16:00:00Z',
      lateCancelRefundBps: 0,
    });
    expect(note().textContent).toContain('Non-refundable last-minute booking');
  });
});
