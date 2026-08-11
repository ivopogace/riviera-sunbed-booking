import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { SetView } from '../shared/venue-views';
import { AwaitingPayment, BookingConfirmation, RequestedBooking } from './booking.model';
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

const CONFIRMATION: BookingConfirmation = {
  code: 'ABCD234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  emailWithheld: false,
};

const AWAITING: AwaitingPayment = {
  code: 'WXYZ345678',
  status: 'AWAITING_PAYMENT',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  clientSecret: 'pi_123_secret_abc',
  paymentIntentId: 'pi_123',
};

const REQUESTED: RequestedBooking = {
  code: 'RQST234567',
  status: 'PENDING_REQUEST',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  requestExpiresAt: '2026-11-30T16:00:00Z',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface DialogProbe {
  model: { set(v: unknown): void };
  step(): number;
  submitAttempted(): boolean;
  submitting(): boolean;
  errorCode: { set(v: string | undefined): void };
  errorMessage(): string | undefined;
}

describe('BookingDialog (2-step Liquid Glass modal)', () => {
  let fixture: ComponentFixture<BookingDialog>;
  let dialog: BookingDialog;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingDialog],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingDialog);
    fixture.componentRef.setInput('set', SET);
    fixture.componentRef.setInput('date', '2026-12-01');
    fixture.componentRef.setInput('venueName', 'Miramar Beach Club');
    dialog = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
  function probe(): DialogProbe {
    return dialog as unknown as DialogProbe;
  }
  function primary(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('[data-testid="dialog-primary"]')!;
  }
  /** Dispatch the form's submit — jsdom does not reliably fire submit on a submit-button click,
   *  so exercise the (submit) binding directly (the primary is a real type=submit button in the DOM). */
  function submitForm(): void {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
  }
  /** Fill the signal-form model with valid guest details (date stays seeded from the input). */
  async function fillValid(): Promise<void> {
    probe().model.set({
      fullName: 'Holiday Guest',
      email: 'guest@example.com',
      phone: '+355699000',
      date: '2026-12-01',
    });
    await fixture.whenStable();
  }
  async function goToReview(): Promise<void> {
    await fillValid();
    submitForm();
    await fixture.whenStable();
  }

  it('opens on the Details step: read-only date + price, step indicator on 1, no editable date input', () => {
    expect(probe().step()).toBe(1);
    expect(host().querySelector('[data-testid="dialog-date"]')?.textContent).toContain('Dec');
    expect(host().querySelector('[data-testid="dialog-price"]')?.textContent).toContain('€45');
    expect(host().querySelector('[data-testid="step-1"]')?.getAttribute('aria-current')).toBe(
      'step',
    );
    expect(host().querySelector('[data-testid="step-2"]')?.getAttribute('aria-current')).toBeNull();
    // Date is now owned by the map — no editable date field in the dialog.
    expect(host().querySelector('input[type="date"]')).toBeNull();
    // Venue name appears in the gradient header.
    expect(host().textContent).toContain('Miramar Beach Club');
  });

  it('shows the legal agreement links on the Review step, opening in a new tab (#101 Slice 3)', async () => {
    // The agreement belongs to the commitment step — not shown while filling details.
    expect(host().querySelector('[data-testid="legal-agreement"]')).toBeNull();
    await goToReview();

    const notice = host().querySelector('[data-testid="legal-agreement"]');
    const terms = notice?.querySelector<HTMLAnchorElement>('[data-testid="legal-terms-link"]');
    const privacy = notice?.querySelector<HTMLAnchorElement>('[data-testid="legal-privacy-link"]');
    expect(terms?.getAttribute('href')).toBe('/legal/terms');
    expect(privacy?.getAttribute('href')).toBe('/legal/privacy');
    // New tab so the modal's checkout state survives reading the document.
    for (const link of [terms, privacy]) {
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toContain('noopener');
    }
  });

  it('keeps the agreement notice on the Review step in REQUEST mode', async () => {
    fixture.componentRef.setInput('mode', 'REQUEST');
    await goToReview();
    expect(host().querySelector('[data-testid="legal-agreement"]')).not.toBeNull();
  });

  it('shows role=alert field errors only after the first Continue, then advances when valid', async () => {
    // Nothing announced before the first submit attempt.
    expect(host().querySelectorAll('[role="alert"]').length).toBe(0);

    submitForm(); // Continue with an empty form
    await fixture.whenStable();
    expect(probe().submitAttempted()).toBe(true);
    expect(host().querySelectorAll('[role="alert"]').length).toBeGreaterThan(0);
    expect(probe().step()).toBe(1); // stays on Details

    await goToReview();
    expect(probe().step()).toBe(2);
    expect(host().querySelector('[data-testid="step-2"]')?.getAttribute('aria-current')).toBe(
      'step',
    );
  });

  it('Review step (INSTANT) shows the summary + total + Instant note + "Continue to payment"; Back returns', async () => {
    await goToReview();

    expect(primary().textContent).toContain('Continue to payment');
    const body = host().textContent ?? '';
    expect(body).toContain('Miramar Beach Club'); // Venue row
    expect(body).toContain('Holiday Guest'); // Guest row (from the form)
    expect(host().querySelector('[data-testid="review-total"]')?.textContent).toContain('€45');
    expect(body).toContain('Instant Book');

    host().querySelector<HTMLButtonElement>('[data-testid="dialog-back"]')!.click();
    await fixture.whenStable();
    expect(probe().step()).toBe(1);
    expect(host().querySelector('[data-testid="step-1"]')?.getAttribute('aria-current')).toBe(
      'step',
    );
  });

  /**
   * The busy posture is `aria-disabled`, which does not stop a form being submitted with Enter from
   * a text field the way a disabled submit button did. Only the handler's own guard does, and this
   * is the money path: a second POST here is a second booking.
   */
  it('posts one booking when the guest submits twice before the first settles', async () => {
    await goToReview();

    submitForm();
    await fixture.whenStable();
    submitForm();
    await fixture.whenStable();

    httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`).flush(CONFIRMATION);
    await fixture.whenStable();
  });

  it('posts the booking with the seeded date and emits booked on a 201 CONFIRMED', async () => {
    await goToReview();
    let emitted: BookingConfirmation | undefined;
    dialog.booked.subscribe((c) => (emitted = c));

    submitForm();
    await fixture.whenStable();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
    expect(req.request.body).toEqual({
      setId: 2,
      bookingDate: '2026-12-01',
      contact: { email: 'guest@example.com', fullName: 'Holiday Guest', phone: '+355699000' },
    });
    req.flush(CONFIRMATION);
    await fixture.whenStable();

    expect(emitted).toEqual(CONFIRMATION);
    expect(probe().submitting()).toBe(false);
    expect(host().querySelector('[data-testid="dialog-error"]')).toBeNull();
  });

  it('emits awaiting (not booked) on a 202 AWAITING_PAYMENT (stripe profile, invariant #8)', async () => {
    await goToReview();
    let booked = false;
    let awaiting: AwaitingPayment | undefined;
    dialog.booked.subscribe(() => (booked = true));
    dialog.awaiting.subscribe((a) => (awaiting = a));

    submitForm();
    await fixture.whenStable();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/bookings`)
      .flush(AWAITING, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();

    expect(awaiting).toEqual(AWAITING);
    expect(booked).toBe(false);
    expect(probe().submitting()).toBe(false);
  });

  it('maps a 409 to the SET_TAKEN alert, stays on Review, and does not emit or navigate', async () => {
    await goToReview();
    let emitted = false;
    dialog.booked.subscribe(() => (emitted = true));

    submitForm();
    await fixture.whenStable();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/bookings`)
      .flush({ status: 409, code: 'SET_TAKEN' }, { status: 409, statusText: 'Conflict' });
    // The submit() helper sets errorCode in a promise continuation; drain it, then render.
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emitted).toBe(false);
    expect(probe().step()).toBe(2); // still open on Review
    expect(probe().errorMessage()).toContain('just booked this set');
    const alert = host().querySelector('[data-testid="dialog-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('just booked this set');
  });

  it('REQUEST venue: Review shows "Send request" + no-charge copy and emits requested on 202 PENDING', async () => {
    fixture.componentRef.setInput('mode', 'REQUEST');
    await goToReview();

    expect(primary().textContent).toContain('Send request');
    expect(host().textContent).toContain('won’t be charged');

    let booked = false;
    let awaiting = false;
    let requested: RequestedBooking | undefined;
    dialog.booked.subscribe(() => (booked = true));
    dialog.awaiting.subscribe(() => (awaiting = true));
    dialog.requested.subscribe((r) => (requested = r));

    submitForm();
    await fixture.whenStable();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/bookings`)
      .flush(REQUESTED, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();

    expect(requested).toEqual(REQUESTED);
    expect(booked).toBe(false);
    expect(awaiting).toBe(false);
  });

  it('emits dismissed from the header close button and from a backdrop click', () => {
    let dismissed = 0;
    dialog.dismissed.subscribe(() => (dismissed += 1));

    host().querySelector<HTMLButtonElement>('[data-testid="dialog-close"]')!.click();
    host().click(); // the host element IS the backdrop (class booking-backdrop + host click handler)
    expect(dismissed).toBe(2);
  });

  it('maps every server error code to a human message', () => {
    const p = probe();
    const cases: Record<string, string> = {
      SET_TAKEN: 'just booked',
      SET_NOT_BOOKABLE_ONLINE: 'not available to book online',
      BOOKING_CLOSED: 'Booking has closed',
      NO_SUCH_SET: 'could not be found',
      INVALID_REQUEST: 'check the form',
      UNKNOWN: 'Something went wrong',
    };
    for (const [code, fragment] of Object.entries(cases)) {
      p.errorCode.set(code);
      expect(p.errorMessage()).toContain(fragment);
    }
    p.errorCode.set(undefined);
    expect(p.errorMessage()).toBeUndefined();
  });

  it('traps Tab focus at both edges of the dialog', async () => {
    await goToReview(); // Review has the full focusable set (Back + primary)
    const panel = host().querySelector('[role="dialog"]')!;
    const focusables = host().querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    first.focus();
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const backPrevent = vi.spyOn(back, 'preventDefault');
    panel.dispatchEvent(back);
    expect(backPrevent).toHaveBeenCalled();

    last.focus();
    const fwd = new KeyboardEvent('keydown', { key: 'Tab' });
    const fwdPrevent = vi.spyOn(fwd, 'preventDefault');
    panel.dispatchEvent(fwd);
    expect(fwdPrevent).toHaveBeenCalled();
  });
});
