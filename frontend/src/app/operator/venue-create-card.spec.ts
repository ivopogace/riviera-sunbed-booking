import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { MockInstance } from 'vitest';

import { environment } from '../../environments/environment';
import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { apiSessionInterceptor } from '../core/api-session.interceptor';
import { VenueCreateCard } from './venue-create-card';

/**
 * Venue creation inside the operator console — the retired /venue-admin editor's create
 * behavior, ledgered row by row in docs/plans/create-venue-into-console.md. Everything the old
 * page did on this path is pinned here as preserved, except the success state, which now
 * navigates straight into the new venue's beach-map tab instead of rendering a "created" card.
 */
describe('VenueCreateCard (#278)', () => {
  let fixture: ComponentFixture<VenueCreateCard>;
  let httpMock: HttpTestingController;
  let auth: OperatorAuth;
  let navigateByUrl: MockInstance<Router['navigateByUrl']>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueCreateCard],
      providers: [
        provideHttpClient(withInterceptors([apiSessionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueCreateCard);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(OperatorAuth);
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
    // Guard-gated surface: the card only mounts signed in, so /me answers a principal.
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/auth/me`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    // The card discloses the platform commission from the server-served default (#692).
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/venue-defaults`)
      .flush({ commissionBps: 500 });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Set a Signal Forms field by the text of its label, then notify the form. */
  function setField(label: string, value: string): void {
    const field = Array.from(host().querySelectorAll('label')).find((l) =>
      l.querySelector('span')?.textContent?.trim().startsWith(label),
    );
    if (!field) {
      throw new Error(`No field labelled "${label}"`);
    }
    const control = field.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function submitButton(): HTMLButtonElement {
    return Array.from(host().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith('Creat'),
    )!;
  }

  async function fillRequiredAndSubmit(): Promise<void> {
    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    fixture.detectChanges();
    submitButton().click();
    await fixture.whenStable();
  }

  it('renders the 7 fields with the defaults (INSTANT / EUR / 18:00) and no commission control', () => {
    // Every field's own <label>, marker-class-free: two of them come from shared components.
    const labels = Array.from(host().querySelectorAll('label')).map((l) =>
      l.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(labels).toEqual([
      'Name',
      'Beach',
      'Region',
      'Description',
      'Booking mode',
      'Payout currency (ISO 4217)',
      'Free-cancellation deadline (Europe/Tirane)',
    ]);
    expect(host().querySelector<HTMLSelectElement>('select')?.value).toBe('INSTANT');
    // The commission input is gone (#692): the platform stamps the rate; nothing to type into.
    expect(host().querySelector('input[inputmode="numeric"]')).toBeNull();
    expect(host().querySelector('[data-testid="venue-create-commission"]')).toBeNull();
    expect(host().querySelector<HTMLInputElement>('input[type="time"]')?.value).toBe('18:00');
  });

  it('states the platform commission from the served default, value-driven (500 → 5%)', () => {
    const note = host().querySelector('[data-testid="venue-create-commission-note"]');
    expect(note?.textContent?.trim()).toBe('The platform commission is 5% per booking.');
  });

  it('renders the served figure, not a hardcoded one (550 → 5.5%)', async () => {
    const second = TestBed.createComponent(VenueCreateCard);
    second.detectChanges();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/venue-defaults`)
      .flush({ commissionBps: 550 });
    await second.whenStable();
    second.detectChanges();

    const note = (second.nativeElement as HTMLElement).querySelector(
      '[data-testid="venue-create-commission-note"]',
    );
    expect(note?.textContent?.trim()).toBe('The platform commission is 5.5% per booking.');
  });

  it('hides the commission note when the defaults read fails, and the form still works', async () => {
    const second = TestBed.createComponent(VenueCreateCard);
    second.detectChanges();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/venue-defaults`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await second.whenStable();
    second.detectChanges();

    const el = second.nativeElement as HTMLElement;
    // No hardcoded fallback figure — a wrong disclosed rate is worse than none.
    expect(el.querySelector('[data-testid="venue-create-commission-note"]')).toBeNull();
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('shows the required-field message once a field is touched, and disables submit while invalid', () => {
    expect(submitButton().disabled).toBe(true);

    const name = host().querySelector<HTMLInputElement>('[data-testid="venue-create-name"]')!;
    name.dispatchEvent(new Event('focus'));
    name.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(host().textContent).toContain('Venue name is required');
    expect(submitButton().disabled).toBe(true);
  });

  it('creates the venue, resets the owned list, then navigates to the new console beach-map tab', async () => {
    const ownedVenues = TestBed.inject(OwnedVenues);
    const reset = vi.spyOn(ownedVenues, 'reset');
    await fillRequiredAndSubmit();

    const createReq = httpMock.expectOne(
      (r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`,
    );
    expect(createReq.request.body).toMatchObject({
      name: 'Sunset Bar',
      beach: 'Ksamil',
      region: 'Riviera',
      bookingMode: 'INSTANT',
      payoutCurrency: 'EUR',
      bookingCutoff: '18:00',
    });
    // The payload carries no rate at all — the server would reject one with a 400 (#692).
    expect(createReq.request.body).not.toHaveProperty('commissionBps');
    // Session model: the HttpOnly cookie is the credential — withCredentials, no header.
    expect(createReq.request.headers.has('Authorization')).toBe(false);
    expect(createReq.request.withCredentials).toBe(true);
    createReq.flush({ id: 31 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    // The stale landing cache is dropped BEFORE navigating into the console it feeds.
    expect(reset).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/operator/31/beach-map');
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
      navigateByUrl.mock.invocationCallOrder[0],
    );
  });

  it('keeps the saving state on the submit button while the create is in flight', async () => {
    await fillRequiredAndSubmit();
    fixture.detectChanges();

    expect(submitButton().textContent?.trim()).toBe('Creating…');
    // Announced as unavailable, but still focusable — disabling it would strand focus on <body>.
    expect(submitButton().getAttribute('aria-disabled')).toBe('true');
    expect(submitButton().disabled).toBe(false);

    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush({ id: 31 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('surfaces a mid-flow 401 as a session-expired error AND drops the lost session (#109)', async () => {
    expect(auth.signedIn()).toBe(true);
    await fillRequiredAndSubmit();

    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('session has expired');
    expect(auth.signedIn()).toBe(false);
    // The form body hides with the dead session — the chrome's sign-in link is the way back.
    expect(host().querySelector('form')).toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('maps a server INVALID_REQUEST problem to the check-the-form message', async () => {
    await fillRequiredAndSubmit();

    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('check the form values');
  });

  it('maps an unknown failure to the generic try-again message', async () => {
    await fillRequiredAndSubmit();

    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain(
      'Something went wrong. Please try again.',
    );
  });
});
