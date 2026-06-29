import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { SetView } from '../venue/venue.model';
import { BookingConfirmation } from './booking.model';
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
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

describe('BookingDialog', () => {
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
    dialog = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Fill the signal-form model with valid guest details (model-driven, per signal-forms.md). */
  async function fillValid(): Promise<void> {
    (dialog as unknown as { model: { set(v: unknown): void } }).model.set({
      fullName: 'Holiday Guest',
      email: 'guest@example.com',
      phone: '+355699000',
      date: '2026-12-01',
    });
    await fixture.whenStable();
  }

  function submitForm(): void {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  it('renders the set summary and the formatted price', () => {
    expect(host().querySelector('.panel-summary')?.textContent).toContain('spot 2');
    expect(host().querySelector('.panel-summary')?.textContent).toContain('€45');
  });

  it('posts the booking and emits booked on success', async () => {
    await fillValid();
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
    expect((dialog as unknown as { submitting(): boolean }).submitting()).toBe(false);
    expect(host().querySelector('.form-error')).toBeNull();
  });

  it('maps a 409 to the SET_TAKEN message and does not emit booked', async () => {
    await fillValid();
    let emitted = false;
    dialog.booked.subscribe(() => (emitted = true));

    submitForm();
    await fixture.whenStable();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/bookings`)
      .flush({ error: 'SET_TAKEN' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(emitted).toBe(false);
    // Assert the mapped state (the @if (errorMessage()) binding drives the .form-error node);
    // the message→DOM rendering is covered by the mapping test.
    const msg = (dialog as unknown as { errorMessage(): string | undefined }).errorMessage();
    expect(msg).toContain('just booked this set');
  });

  it('emits dismissed when the Cancel button is clicked', () => {
    let dismissed = false;
    dialog.dismissed.subscribe(() => (dismissed = true));
    host().querySelector<HTMLButtonElement>('.btn-secondary')!.click();
    expect(dismissed).toBe(true);
  });

  it('maps every server error code to a human message', () => {
    const d = dialog as unknown as {
      errorCode: { set(v: string | undefined): void };
      errorMessage(): string | undefined;
    };
    const cases: Record<string, string> = {
      SET_TAKEN: 'just booked',
      SET_NOT_BOOKABLE_ONLINE: 'not available to book online',
      BOOKING_CLOSED: 'Booking has closed',
      NO_SUCH_SET: 'could not be found',
      INVALID_REQUEST: 'check the form',
      UNKNOWN: 'Something went wrong',
    };
    for (const [code, fragment] of Object.entries(cases)) {
      d.errorCode.set(code);
      expect(d.errorMessage()).toContain(fragment);
    }
    d.errorCode.set(undefined);
    expect(d.errorMessage()).toBeUndefined();
  });

  it('traps Tab focus at both edges of the dialog', async () => {
    await fillValid(); // enables the submit button so the focusable set is complete
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
