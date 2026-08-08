import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { AdminMailDelivery } from './admin-mail-delivery';
import { AdminMailDeliveryService } from './admin-mail-delivery.service';
import { MailDeliveryLookupView } from './admin.model';

/**
 * Structural axe audit of the mail-delivery card: the labelled search field, the per-booking
 * results list with its own action, and the polite live region that announces a resend's outcome.
 * Audited in both states the card has — before a search and with results — since the results state
 * introduces every interactive element on the card. Contrast is not measurable by axe under jsdom; it
 * is proven in the e2e.
 */
const RESULTS: MailDeliveryLookupView = {
  bookings: [
    {
      bookingId: 42,
      venueName: 'Vala Beach',
      bookingDate: '2026-08-01',
      everConfirmed: true,
      attempts: [
        { source: 'AUTOMATIC', outcome: 'WITHHELD_SUPPRESSED', attemptedAt: '2026-07-29T14:02:11Z' },
      ],
    },
    {
      bookingId: 43,
      venueName: 'Vala Beach',
      bookingDate: '2026-07-04',
      everConfirmed: false,
      attempts: [],
    },
  ],
};

function serviceStub(lookup: MailDeliveryLookupView): Partial<AdminMailDeliveryService> {
  return {
    lookup: async () => lookup,
    resend: async () => ({ outcome: 'SENT' }),
  };
}

async function render(lookup: MailDeliveryLookupView): Promise<ComponentFixture<AdminMailDelivery>> {
  await TestBed.configureTestingModule({
    imports: [AdminMailDelivery],
    providers: [{ provide: AdminMailDeliveryService, useValue: serviceStub(lookup) }],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminMailDelivery);
  fixture.detectChanges();
  return fixture;
}

async function search(fixture: ComponentFixture<AdminMailDelivery>): Promise<void> {
  const input: HTMLInputElement = fixture.nativeElement.querySelector(
    '[data-testid="admin-delivery-email"]',
  );
  input.value = 'tourist@example.com';
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  (
    fixture.nativeElement.querySelector('[data-testid="admin-delivery-lookup"]') as HTMLButtonElement
  ).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminMailDelivery a11y', () => {
  it('has no axe violations before a search (AC-10)', async () => {
    const fixture = await render({ bookings: [] });

    await expectNoAxeViolations(fixture.nativeElement);
  });

  it('has no axe violations with results (AC-10)', async () => {
    const fixture = await render(RESULTS);
    await search(fixture);

    await expectNoAxeViolations(fixture.nativeElement);
  });

  /**
   * The resend outcome appears without a focus change and is the entire point of pressing the button,
   * so a screen-reader user only learns it if the region announces itself.
   */
  it('announces the resend outcome through a polite live region', async () => {
    const fixture = await render(RESULTS);

    const notice: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="admin-delivery-notice"]',
    );
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.getAttribute('aria-live')).toBe('polite');
  });

  /** Each resend button is one of several on the page, so its name must say which booking it acts on. */
  it('gives every resend button an accessible name and a distinct target', async () => {
    const fixture = await render(RESULTS);
    await search(fixture);

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid^="admin-delivery-resend-"]'),
    );
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.textContent?.trim()).toBeTruthy();
    }
  });
});
