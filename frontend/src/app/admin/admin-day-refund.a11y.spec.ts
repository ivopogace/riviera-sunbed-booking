import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { AdminDayRefund } from './admin-day-refund';
import { AdminDayRefundService } from './admin-day-refund.service';
import { GuestBookingLookupView } from './admin.model';

/**
 * Structural axe audit of the admin day-refund card: the labelled search field, the per-booking
 * results with a status pill and one action per open day, the reason-collecting confirm dialog, and
 * the polite live region that announces the outcome. Audited before a search, with results and with
 * the confirm open, since each state introduces its own interactive elements. Contrast is not
 * measurable by axe under jsdom; it is proven in the e2e.
 */
const RESULTS: GuestBookingLookupView = {
  bookings: [
    {
      bookingId: 42,
      venueName: 'Vala Beach',
      firstDate: '2026-08-01',
      lastDate: '2026-08-03',
      status: 'CONFIRMED',
      refundable: true,
      days: [
        { date: '2026-08-01', state: 'ATTENDED' },
        { date: '2026-08-02', state: 'OPEN' },
        { date: '2026-08-03', state: 'OPEN' },
      ],
    },
    {
      bookingId: 43,
      venueName: 'Vala Beach',
      firstDate: '2026-07-04',
      lastDate: '2026-07-04',
      status: 'AWAITING_PAYMENT',
      refundable: false,
      days: [],
    },
  ],
};

function serviceStub(lookup: GuestBookingLookupView): Partial<AdminDayRefundService> {
  return {
    lookup: () => Promise.resolve(lookup),
    refund: () =>
      Promise.resolve({
        kind: 'DAY_REFUNDED',
        serviceDate: '2026-08-02',
        refundMinor: 4500,
        currency: 'EUR',
        released: true,
      }),
  };
}

async function render(lookup: GuestBookingLookupView): Promise<ComponentFixture<AdminDayRefund>> {
  await TestBed.configureTestingModule({
    imports: [AdminDayRefund],
    providers: [{ provide: AdminDayRefundService, useValue: serviceStub(lookup) }],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminDayRefund);
  fixture.detectChanges();
  return fixture;
}

function testId(fixture: ComponentFixture<AdminDayRefund>, id: string): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`)!;
}

async function search(fixture: ComponentFixture<AdminDayRefund>): Promise<void> {
  const input = testId(fixture, 'admin-day-refund-email') as HTMLInputElement;
  input.value = 'tourist@example.com';
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  testId(fixture, 'admin-day-refund-lookup').click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminDayRefund a11y', () => {
  it('has no axe violations before a search', async () => {
    const fixture = await render({ bookings: [] });

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no axe violations with results', async () => {
    const fixture = await render(RESULTS);
    await search(fixture);

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no axe violations with the confirm open', async () => {
    const fixture = await render(RESULTS);
    await search(fixture);
    testId(fixture, 'admin-day-refund-open-42-2026-08-02').click();
    fixture.detectChanges();

    expect(testId(fixture, 'admin-day-refund-confirm-panel-42').getAttribute('role')).toBe(
      'alertdialog',
    );
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  /** The outcome appears without a focus change unless the mover lands, so the region announces itself too. */
  it('announces the outcome through a polite live region', async () => {
    const fixture = await render(RESULTS);

    const notice = testId(fixture, 'admin-day-refund-notice');
    expect(notice.tagName).toBe('OUTPUT');
    expect(notice.getAttribute('aria-live')).toBe('polite');
  });

  /** Each day's button is one of several on the page, so its name must say which day it acts on. */
  it('gives every day action a distinct target and an accessible name', async () => {
    const fixture = await render(RESULTS);
    await search(fixture);

    const buttons: HTMLButtonElement[] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid^="admin-day-refund-open-"]',
      ),
    );
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.textContent?.trim()).toBeTruthy();
    }
  });
});
