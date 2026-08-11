import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

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
  let router: Router;

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
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
    // Guard-gated surface: the card only mounts signed in, so /me answers a principal.
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/auth/me`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Set a Signal Forms field by the text of its label, then notify the form. */
  function setField(label: string, value: string): void {
    const field = Array.from(host().querySelectorAll('label.field')).find((l) =>
      l.querySelector('span')?.textContent?.trim().startsWith(label),
    );
    const control = field?.querySelector('input, select') as HTMLInputElement | HTMLSelectElement;
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function submitButton(): HTMLButtonElement {
    return Array.from(host().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith('Creat'),
    ) as HTMLButtonElement;
  }

  async function fillRequiredAndSubmit(): Promise<void> {
    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    fixture.detectChanges();
    submitButton().click();
    await fixture.whenStable();
  }

  it('renders the 8 fields with the retired editor defaults (INSTANT / 1500 / EUR / 18:00)', () => {
    const labels = Array.from(host().querySelectorAll('label.field span')).map((s) =>
      s.textContent?.trim(),
    );
    expect(labels).toEqual([
      'Name',
      'Beach',
      'Region',
      'Description',
      'Booking mode',
      'Commission (basis points)',
      'Payout currency (ISO 4217)',
      'Booking cutoff (Europe/Tirane)',
    ]);
    expect(host().querySelector<HTMLSelectElement>('select')?.value).toBe('INSTANT');
    const commission = host().querySelector<HTMLInputElement>('input[inputmode="numeric"]');
    expect(commission?.value).toBe('1500');
    expect(host().querySelector<HTMLInputElement>('input[type="time"]')?.value).toBe('18:00');
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
      commissionBps: 1500,
      payoutCurrency: 'EUR',
      bookingCutoff: '18:00',
    });
    // Session model: the HttpOnly cookie is the credential — withCredentials, no header.
    expect(createReq.request.headers.has('Authorization')).toBe(false);
    expect(createReq.request.withCredentials).toBe(true);
    createReq.flush({ id: 31 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    // The stale landing cache is dropped BEFORE navigating into the console it feeds.
    expect(reset).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/operator/31/beach-map');
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(router.navigateByUrl).mock.invocationCallOrder[0],
    );
  });

  it('rejects a non-integer commission client-side without calling the server', async () => {
    setField('Commission', '15.5'); // not clean digits → must not be truncated to 15 and sent
    await fillRequiredAndSubmit();

    httpMock.expectNone(`${environment.apiBaseUrl}/api/venues`);
    fixture.detectChanges();
    expect(host().querySelector('[role="alert"]')?.textContent).toContain('check the form values');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
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
    expect(router.navigateByUrl).not.toHaveBeenCalled();
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
