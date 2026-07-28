import { TestBed } from '@angular/core/testing';

import { WithheldEmailNotice } from './withheld-email-notice';

/**
 * The shared notice's own contract (#390): the copy both post-payment surfaces render, and the
 * `data-testid` their specs and the e2e suite query. Its consumers assert that it appears; this
 * asserts what it says, in one place.
 */
describe('WithheldEmailNotice', () => {
  it('states that no email was sent and tells the guest to save the code', () => {
    const fixture = TestBed.createComponent(WithheldEmailNotice);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const notice = host.querySelector('[data-testid="email-withheld"]');
    expect(notice?.textContent).toContain('We couldn’t email you.');
    expect(notice?.textContent).toContain('save it or take a screenshot');
  });

  it('carries no live region — it enters the DOM with its container, so it would never announce', () => {
    const fixture = TestBed.createComponent(WithheldEmailNotice);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
  });
});
