import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { SetView } from '../venue/venue.model';
import { BookingDialog } from './booking-dialog';

const SET: SetView = {
  id: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  tier: 'PREMIUM',
  pool: 'ONLINE',
  price: { minorUnits: 4500, currency: 'EUR' },
  gridX: 2,
  gridY: 1,
  availability: 'FREE',
};

/**
 * Structural axe audit of the Liquid Glass booking dialog (issue #137, AC-12): the modal exposes a
 * dialog role, an accessible name (venue + set, via `aria-labelledby`), a labelled step form, and a
 * close control — on BOTH steps (Details and Review). Contrast is checked separately in
 * booking-dialog.contrast.spec.ts (axe can't measure it under jsdom).
 */
describe('BookingDialog accessibility (axe)', () => {
  let fixture: ComponentFixture<BookingDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingDialog);
    fixture.componentRef.setInput('set', SET);
    fixture.componentRef.setInput('date', '2026-12-01');
    fixture.componentRef.setInput('venueName', 'Miramar Beach Club');
    await fixture.whenStable();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('exposes a dialog with an accessible name from the venue + set header', () => {
    const dialog = host().querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toContain('booking-dialog-title');
    expect(host().querySelector('#booking-dialog-venue')?.textContent).toContain('Miramar Beach Club');
    expect(host().querySelector('#booking-dialog-title')?.textContent).toContain('Front row · Sea view');
    expect(host().querySelector('[data-testid="dialog-close"]')?.getAttribute('aria-label')).toBe('Close');
  });

  it('has no critical/serious violations on the Details step', async () => {
    await expectNoAxeViolations(host());
  });

  it('has no critical/serious violations on the Review step', async () => {
    (fixture.componentInstance as unknown as { model: { set(v: unknown): void } }).model.set({
      fullName: 'Holiday Guest',
      email: 'guest@example.com',
      phone: '+355699000',
      date: '2026-12-01',
    });
    await fixture.whenStable();
    host().querySelector('form')!.dispatchEvent(new Event('submit')); // Continue → Review
    await fixture.whenStable();

    expect(host().querySelector('[data-testid="step-2"]')?.getAttribute('aria-current')).toBe('step');
    await expectNoAxeViolations(host());
  });
});
