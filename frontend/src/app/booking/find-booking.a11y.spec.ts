import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { expectNoAxeViolations } from '../../testing/axe';
import { BookingDetail } from './booking.model';
import { BookingService } from './booking.service';
import { FindBooking } from './find-booking';

/**
 * Structural axe audit of the Liquid Glass "Find a booking" modal: the
 * modal exposes a dialog role with an accessible name from its heading, a labelled code input, and
 * a close control — on both the idle and the not-found error states. Contrast is checked separately
 * in find-booking.contrast.spec.ts (axe can't measure it under jsdom); real focus/trap is proven in
 * the e2e (a real browser).
 */
function stub(getError?: unknown): Partial<BookingService> {
  return {
    getByCode: () => (getError ? throwError(() => getError) : of({} as BookingDetail)),
  };
}

async function render(service: Partial<BookingService>): Promise<ComponentFixture<FindBooking>> {
  await TestBed.configureTestingModule({
    imports: [FindBooking],
    providers: [provideRouter([]), { provide: BookingService, useValue: service }],
  }).compileComponents();
  const fixture = TestBed.createComponent(FindBooking);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('FindBooking accessibility (axe)', () => {
  it('exposes a dialog with an accessible name, a labelled input, and a close control', async () => {
    const fixture = await render(stub());
    const host = fixture.nativeElement as HTMLElement;

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toContain('find-title');
    expect(host.querySelector('#find-title')?.textContent).toContain('Find your booking');
    expect(host.querySelector('[data-testid="find-close"]')?.getAttribute('aria-label')).toBe(
      'Close',
    );
    // The code input is named by its wrapping label ("Booking code").
    expect(host.querySelector('label')?.textContent).toContain('Booking code');
    expect(host.querySelector('[data-testid="find-code"]')).not.toBeNull();
  });

  it('has no critical/serious violations in the idle state', async () => {
    const fixture = await render(stub());
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('announces the lookup error in an alert region with no new violations', async () => {
    const fixture = await render(stub({ status: 404 }));
    const host = fixture.nativeElement as HTMLElement;

    (
      fixture.componentInstance as unknown as { model: { set(v: { code: string }): void } }
    ).model.set({ code: 'ZZZZ999999' });
    fixture.detectChanges();
    host.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const error = host.querySelector('[data-testid="find-error"]');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('No booking found');
    await expectNoAxeViolations(host);
  });
});
