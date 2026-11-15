import { TestBed } from '@angular/core/testing';

import type { ConfirmationMail } from './booking.model';
import { ConfirmationMailNote } from './confirmation-mail-note';

/**
 * The three mail copies in one place (#1748): only the verified owner hears whether the mail went
 * out or was withheld; everyone else gets a line that never claims a mail was sent.
 */
describe('ConfirmationMailNote', () => {
  function render(mail: ConfirmationMail): HTMLElement {
    const fixture = TestBed.createComponent(ConfirmationMailNote);
    fixture.componentRef.setInput('mail', mail);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('tells a reader who is not the verified owner only that a mail is on its way', () => {
    const host = render('UNDISCLOSED');

    expect(host.querySelector('[data-testid="email-pending"]')?.textContent).toContain(
      'We’re emailing it to you. Keep this code in case it doesn’t arrive.',
    );
    expect(host.textContent).not.toContain('emailed it');
    expect(host.querySelector('[data-testid="email-withheld"]')).toBeNull();
  });

  it('tells the verified owner of a deliverable address the mail went out', () => {
    const host = render('EMAILED');

    expect(host.querySelector('[data-testid="email-sent"]')?.textContent).toContain(
      'We’ve also emailed it to you.',
    );
    expect(host.querySelector('[data-testid="email-withheld"]')).toBeNull();
  });

  it('shows the verified owner of a suppressed address the withheld notice and no sent claim', () => {
    const host = render('WITHHELD');

    expect(host.querySelector('[data-testid="email-withheld"]')).not.toBeNull();
    expect(host.textContent).not.toContain('emailed it to you');
    expect(host.querySelector('[data-testid="email-pending"]')).toBeNull();
  });
});
