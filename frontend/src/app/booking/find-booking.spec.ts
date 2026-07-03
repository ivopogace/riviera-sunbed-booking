import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { BookingDetail } from './booking.model';
import { BookingService } from './booking.service';
import { FindBooking } from './find-booking';

const DETAIL: BookingDetail = {
  code: 'ABCD234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: true,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
  requestExpiresAt: null,
  payment: null,
};

/** A found-by-code stub; `getByCode` is a spy so tests assert the normalized code sent. */
function foundService(detail: BookingDetail = DETAIL): {
  service: Partial<BookingService>;
  getByCode: ReturnType<typeof vi.fn>;
} {
  const getByCode = vi.fn(() => of(detail) as Observable<BookingDetail>);
  return { service: { getByCode }, getByCode };
}

/** A stub whose lookup fails with the given HTTP-ish error (e.g. `{ status: 404 }`). */
function erroringService(error: unknown): {
  service: Partial<BookingService>;
  getByCode: ReturnType<typeof vi.fn>;
} {
  const getByCode = vi.fn(() => throwError(() => error) as Observable<BookingDetail>);
  return { service: { getByCode }, getByCode };
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

/** Set the code field via the Signal-Forms model (the booking-dialog.a11y test pattern). */
function setCode(fixture: ComponentFixture<FindBooking>, code: string): void {
  (fixture.componentInstance as unknown as { model: { set(v: { code: string }): void } }).model.set({
    code,
  });
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<FindBooking>): void {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

function errorText(fixture: ComponentFixture<FindBooking>): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="find-error"]')?.textContent ??
    ''
  ).trim();
}

describe('FindBooking', () => {
  it('looks up the entered code and navigates to its booking detail', async () => {
    const { service, getByCode } = foundService();
    const fixture = await render(service);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setCode(fixture, 'ABCD234567');
    submit(fixture);
    await fixture.whenStable();

    expect(getByCode).toHaveBeenCalledWith('ABCD234567');
    expect(navigate).toHaveBeenCalledWith(['/booking', 'ABCD234567']);
    expect(errorText(fixture)).toBe('');
  });

  it('normalizes the entered code (trim, uppercase, strip spaces/dashes) before lookup', async () => {
    const { service, getByCode } = foundService();
    const fixture = await render(service);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setCode(fixture, '  abcd-2345 67 ');
    submit(fixture);
    await fixture.whenStable();

    expect(getByCode).toHaveBeenCalledWith('ABCD234567');
    expect(navigate).toHaveBeenCalledWith(['/booking', 'ABCD234567']);
  });

  it('shows the not-found error (echoing the code) and does not navigate on a 404', async () => {
    const { service } = erroringService({ status: 404 });
    const fixture = await render(service);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setCode(fixture, 'ZZZZ999999');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges(); // render the error the async catch set after submit's CD

    expect(errorText(fixture)).toBe('No booking found for ZZZZ999999. Check the code and try again.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the rate-limit retry copy and does not navigate on a 429', async () => {
    const { service } = erroringService({ status: 429 });
    const fixture = await render(service);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setCode(fixture, 'ABCD234567');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges(); // render the error the async catch set after submit's CD

    expect(errorText(fixture)).toBe('Too many attempts. Please wait a moment and try again.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([{ status: 0 }, { status: 500 }])(
    'shows a generic error and does not navigate on a %o transport/5xx failure',
    async (error) => {
      const { service } = erroringService(error);
      const fixture = await render(service);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      setCode(fixture, 'ABCD234567');
      submit(fixture);
      await fixture.whenStable();
      fixture.detectChanges(); // render the error the async catch set after submit's CD

      expect(errorText(fixture)).toBe('Something went wrong. Please try again.');
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('requires a code before calling the API (empty submit)', async () => {
    const { service, getByCode } = foundService();
    const fixture = await render(service);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setCode(fixture, '');
    submit(fixture);
    await fixture.whenStable();

    expect(errorText(fixture)).toBe('Enter your booking code.');
    expect(getByCode).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not issue a second lookup while one is in flight (rate-limit oracle guard)', async () => {
    // A lookup that never resolves keeps `submitting` true, so a repeat submit must be a no-op.
    const getByCode = vi.fn(
      () => new Observable<BookingDetail>(() => {/* never emits — keeps the lookup in flight */}),
    );
    const fixture = await render({ getByCode });

    setCode(fixture, 'ABCD234567');
    submit(fixture);
    submit(fixture);
    await fixture.whenStable();

    expect(getByCode).toHaveBeenCalledTimes(1);
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="find-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('emits close on the close button, the backdrop, and Escape', async () => {
    const { service } = foundService();
    const fixture = await render(service);
    const closes = vi.fn();
    fixture.componentInstance.dismissed.subscribe(closes);
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="find-close"]') as HTMLButtonElement).click();
    host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closes).toHaveBeenCalledTimes(3);
  });

  // Review finding [2]: a whitespace/dash-only entry passes `required` (non-empty) but normalizes to
  // empty — it must show the enter-a-code message, not silently do nothing.
  it('shows the enter-a-code message for a whitespace/dash-only entry and makes no request', async () => {
    const { service, getByCode } = foundService();
    const fixture = await render(service);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setCode(fixture, '   --  ');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorText(fixture)).toBe('Enter your booking code.');
    expect(getByCode).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  // Review finding [3]: a stale server error must clear as the guest edits the code.
  it('clears a stale lookup error when the guest edits the code', async () => {
    const { service } = erroringService({ status: 404 });
    const fixture = await render(service);

    setCode(fixture, 'ZZZZ999999');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(errorText(fixture)).toContain('No booking found');

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="find-code"]',
    ) as HTMLInputElement;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(errorText(fixture)).toBe('');
  });

  // Review finding [1]: a no-op navigation (Angular drops a same-URL navigate → resolves false, no
  // NavigationEnd) must still close the modal, not freeze it on "Opening…".
  it('closes the modal without freezing when the navigation is a no-op (same URL)', async () => {
    const { service } = foundService();
    const fixture = await render(service);
    const closes = vi.fn();
    fixture.componentInstance.dismissed.subscribe(closes);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(false);

    setCode(fixture, 'ABCD234567');
    submit(fixture);
    // Flush the full async chain: lookup resolves → navigate resolves false → dismissed.emit.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(closes).toHaveBeenCalledTimes(1);
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="find-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false); // not stuck disabled
  });
});
