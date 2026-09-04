import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { ProofOfWork } from '../core/proof-of-work';
import { defineFakeAltchaElement, FakeAltchaElement } from '../../testing/fake-altcha-element';
import { todayBookingDate } from '../shared/booking-date';
import { SetView } from '../shared/venue-views';
import {
  AwaitingPayment,
  BookingConfirmation,
  CancellationTerms,
  RequestedBooking,
} from './booking.model';
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

// jsdom has no Web Workers: the widget is the element stand-in, never the real bundle.
vi.mock('altcha', () => ({}));

/** The platform's fence answer, driven per test — the real service would probe over HTTP. */
class FakeProofOfWork {
  readonly enabled = signal<boolean | undefined>(false);
}

const CHALLENGE_HEADER = 'X-Altcha-Payload';

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
  let proofOfWork: FakeProofOfWork;

  beforeAll(defineFakeAltchaElement);

  beforeEach(async () => {
    proofOfWork = new FakeProofOfWork();
    await TestBed.configureTestingModule({
      imports: [BookingDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProofOfWork, useValue: proofOfWork },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingDialog);
    fixture.componentRef.setInput('set', SET);
    fixture.componentRef.setInput('date', '2026-12-01');
    fixture.componentRef.setInput('venueName', 'Miramar Beach Club');
    dialog = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    // Resolve the pre-reserve terms quote (#795): the pending httpResource would park whenStable.
    fixture.detectChanges();
    httpMock.expectOne(TERMS_URL).flush(FREE_TERMS);
    await fixture.whenStable();
  });

  afterEach(() => {
    // Drain the terms quote any test left unanswered — its absence is a legitimate state (no claim).
    httpMock.match((req) => req.url.includes('/api/bookings/cancellation-terms'));
    httpMock.verify();
  });

  const TERMS_URL = `${environment.apiBaseUrl}/api/bookings/cancellation-terms?setId=2&date=2026-12-01`;

  const FREE_TERMS: CancellationTerms = {
    window: 'FREE',
    freeCancellationEndsAt: '2026-11-30T17:00:00Z',
    lateCancelRefundBps: 0,
  };

  function termsNote(): HTMLElement | null {
    return host().querySelector('[data-testid="cancellation-terms-note"]');
  }

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

  describe('the pre-reserve cancellation terms (#795 AC-10)', () => {
    /** Re-quote by moving the dialog's date — the resource keys on (set, date). */
    async function requoteWith(terms: CancellationTerms): Promise<void> {
      fixture.componentRef.setInput('date', '2026-12-02');
      fixture.detectChanges();
      httpMock
        .expectOne(
          `${environment.apiBaseUrl}/api/bookings/cancellation-terms?setId=2&date=2026-12-02`,
        )
        .flush(terms);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('states free cancellation until the deadline for FREE terms, inside a live region', async () => {
      await goToReview();
      const note = termsNote();
      expect(note?.textContent).toContain('Free cancellation until');
      expect(note?.closest('[role="status"]')).not.toBeNull();
    });

    it('renders no cancellation claim while a re-quote is loading', async () => {
      await goToReview();
      fixture.componentRef.setInput('date', '2026-12-02');
      fixture.detectChanges();
      expect(termsNote()).toBeNull();
      expect(host().textContent).not.toContain('Free cancellation');
    });

    it('renders no cancellation claim when the terms read failed', async () => {
      await goToReview();
      fixture.componentRef.setInput('date', '2026-12-02');
      fixture.detectChanges();
      httpMock
        .expectOne(
          `${environment.apiBaseUrl}/api/bookings/cancellation-terms?setId=2&date=2026-12-02`,
        )
        .flush({ code: 'NO_SUCH_SET' }, { status: 404, statusText: 'Not Found' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(termsNote()).toBeNull();
      expect(host().textContent).not.toContain('Free cancellation');
    });

    it('states the non-refundable last-minute booking for CLOSED terms', async () => {
      await requoteWith({ ...FREE_TERMS, window: 'CLOSED' });
      await goToReview();
      expect(termsNote()?.textContent).toContain('Non-refundable last-minute booking');
    });

    it('states the partial share for LATE terms with a venue share', async () => {
      await requoteWith({ ...FREE_TERMS, window: 'LATE', lateCancelRefundBps: 2500 });
      await goToReview();
      expect(termsNote()?.textContent).toContain('refunds only 25%');
    });

    it('discloses on the Request review step too (both modes, AC-1)', async () => {
      fixture.componentRef.setInput('mode', 'REQUEST');
      await requoteWith({ ...FREE_TERMS, window: 'CLOSED' });
      await goToReview();
      expect(host().textContent).toContain('Request to Book');
      expect(termsNote()?.textContent).toContain('Non-refundable last-minute booking');
    });
  });

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

  it('describes each guest-contact field by its error', async () => {
    submitForm(); // Continue with an empty form
    await fixture.whenStable();

    for (const autocomplete of ['name', 'email', 'tel']) {
      const control = host().querySelector<HTMLInputElement>(
        `input[autocomplete="${autocomplete}"]`,
      )!;
      const errorId = control.getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();
      expect(control.getAttribute('aria-invalid')).toBe('true');

      const error = host().querySelector(`#${errorId}`);
      expect(error?.getAttribute('role')).toBe('alert');
      expect(error?.textContent?.trim()).toBeTruthy();
    }
  });

  it('stops describing the guest-contact fields once they are valid', async () => {
    submitForm();
    await fixture.whenStable();

    // Pin the take first: an absence-only assertion also passes when nothing was ever written.
    for (const autocomplete of ['name', 'email', 'tel']) {
      const control = host().querySelector<HTMLInputElement>(
        `input[autocomplete="${autocomplete}"]`,
      )!;
      expect(control.getAttribute('aria-describedby')).toBeTruthy();
    }

    await fillValid();

    for (const autocomplete of ['name', 'email', 'tel']) {
      const control = host().querySelector<HTMLInputElement>(
        `input[autocomplete="${autocomplete}"]`,
      )!;
      expect(control.hasAttribute('aria-describedby')).toBe(false);
      expect(control.hasAttribute('aria-invalid')).toBe(false);
    }
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

    // The dialog stamps its resolved quote onto the hand-off so the pay page can repeat it (#795).
    expect(awaiting).toEqual({ ...AWAITING, cancellationTerms: FREE_TERMS });
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

  describe('the proof-of-work fence on create (ADR-0016)', () => {
    /**
     * Advance to Review — where the widget is hosted — and settle its solve, as a real verify would.
     * The order matters: on Details there is no widget to drive.
     */
    async function reviewWithSolvedChallenge(
      payload = 'solved-base64-payload',
    ): Promise<FakeAltchaElement> {
      proofOfWork.enabled.set(true);
      await goToReview();
      const widget = host().querySelector<FakeAltchaElement>('altcha-widget')!;
      widget.changeState('verified', payload);
      await fixture.whenStable();
      return widget;
    }

    it('the widget is hosted on the step that submits, not on Details', async () => {
      proofOfWork.enabled.set(true);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(host().querySelector('altcha-widget')).toBeNull();

      await goToReview();
      expect(host().querySelector('altcha-widget')).not.toBeNull();
    });

    it('sends the solved challenge as the fence header on create', async () => {
      await reviewWithSolvedChallenge();

      submitForm();
      await fixture.whenStable();

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
      expect(req.request.headers.get(CHALLENGE_HEADER)).toBe('solved-base64-payload');
      req.flush(CONFIRMATION);
      await fixture.whenStable();
    });

    it.each([
      ['CHALLENGE_REQUIRED', 'hasn’t finished yet'],
      ['CHALLENGE_INVALID', 'didn’t verify'],
      ['CHALLENGE_EXPIRED', 'expired'],
    ])('a %s rejection names the reason and restarts the widget', async (code, wording) => {
      const widget = await reviewWithSolvedChallenge();
      let emitted = false;
      dialog.booked.subscribe(() => (emitted = true));

      submitForm();
      await fixture.whenStable();
      httpMock
        .expectOne(`${environment.apiBaseUrl}/api/bookings`)
        .flush({ status: 400, code }, { status: 400, statusText: 'Bad Request' });
      await fixture.whenStable();
      await fixture.whenStable();
      fixture.detectChanges();

      // A refused create is never a booking, and the tourist stays on Review to retry.
      expect(emitted).toBe(false);
      expect(probe().step()).toBe(2);
      const alert = host().querySelector('[data-testid="dialog-error"]');
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent).toContain(wording);
      // The stale solution is spent, so the retry cannot reuse it: the widget was restarted.
      expect(widget.reset).toHaveBeenCalled();
      expect(widget.verify).toHaveBeenCalled();
    });

    it('the kill switch hides the widget and the create carries no header', async () => {
      expect(proofOfWork.enabled()).toBe(false);
      await goToReview();
      expect(host().querySelector('altcha-widget')).toBeNull();

      submitForm();
      await fixture.whenStable();

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
      expect(req.request.headers.has(CHALLENGE_HEADER)).toBe(false);
      req.flush(CONFIRMATION);
      await fixture.whenStable();
    });
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

  it('renders the today-specific BOOKING_CLOSED copy for a same-day attempt, the generic copy otherwise (#791)', () => {
    const p = probe();
    p.errorCode.set('BOOKING_CLOSED');
    expect(p.errorMessage()).toContain('Booking has closed');

    fixture.componentRef.setInput('date', todayBookingDate(new Date()));
    expect(p.errorMessage()).toContain('Online sales for today have closed');
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
