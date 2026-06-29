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
 * Structural axe audit of the booking dialog (issue #6, AC-13): the modal must expose a
 * dialog role, an accessible name, and properly-labelled form fields. Contrast is checked
 * separately in booking-dialog.contrast.spec.ts (axe can't measure it under jsdom).
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
    await fixture.whenStable();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('exposes a dialog with an accessible name', () => {
    const dialog = host().querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('booking-dialog-title');
    expect(host().querySelector('#booking-dialog-title')?.textContent).toContain('Book this set');
  });

  it('has no critical/serious violations', async () => {
    await expectNoAxeViolations(host());
  });
});
