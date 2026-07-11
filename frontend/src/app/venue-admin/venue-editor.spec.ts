import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { OperatorAuth } from '../core/operator-auth';
import { apiSessionInterceptor } from '../core/api-session.interceptor';
import { VenueEditor } from './venue-editor';

/**
 * Venue onboarding (the retired editor's surviving job, O8 #177): sign in and CREATE a venue, then
 * link into the console. Editing (layout/pricing/details/commodities) moved to the console tabs, so
 * those flows are tested there (`layout-editor`, `pricing-tab`, `venue-tab`), not here.
 */
describe('VenueEditor (onboarding, #177)', () => {
  let fixture: ComponentFixture<VenueEditor>;
  let httpMock: HttpTestingController;
  let auth: OperatorAuth;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueEditor],
      providers: [
        provideHttpClient(withInterceptors([apiSessionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueEditor);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(OperatorAuth);
    fixture.detectChanges();
    // Constructing OperatorAuth fires the session restore (GET /api/auth/me, issue #109);
    // answer 401 so every test starts signed out with restoring() settled.
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/auth/me`)
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Establish an operator session: submit the credential and flush the login POST (issue #109). */
  async function signIn(): Promise<void> {
    const result = auth.signIn('operator', 'pw');
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/auth/operator/login`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await result;
    fixture.detectChanges();
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

  function clickButton(text: string): void {
    const button = Array.from(host().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(text),
    );
    button!.click();
  }

  it('shows the operator sign-in until signed in', () => {
    expect(host().textContent).toContain('Operator sign-in');
    expect(host().textContent).not.toContain('Create venue');
  });

  it('creates a venue and links the operator into its console', async () => {
    await signIn();

    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    fixture.detectChanges();

    clickButton('Create venue');
    await fixture.whenStable();

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
    // Session model (issue #109): the HttpOnly cookie is the credential — withCredentials, no header.
    expect(createReq.request.headers.has('Authorization')).toBe(false);
    expect(createReq.request.withCredentials).toBe(true);
    createReq.flush({ id: 5 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    fixture.detectChanges();

    // No read-back: the created venue is edited in the console. The card confirms + links there.
    expect(host().textContent).toContain('Venue #5 created');
    const link = host().querySelector<HTMLAnchorElement>('[data-testid="venue-console-link"]');
    expect(link?.getAttribute('href')).toBe('/operator/5');
  });

  it('rejects a non-integer commission client-side without calling the server', async () => {
    await signIn();
    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    setField('Commission', '15.5'); // not clean digits → must not be truncated to 15 and sent
    fixture.detectChanges();

    clickButton('Create venue');
    await fixture.whenStable();

    httpMock.expectNone(`${environment.apiBaseUrl}/api/venues`);
    fixture.detectChanges();
    expect(host().querySelector('[role="alert"]')?.textContent).toContain('check the form values');
  });

  it('surfaces a mid-flow 401 as a session-expired error AND drops the lost session', async () => {
    // Signed in, but the session dies before the write (expired/invalidated server-side): the 401
    // on the venue POST surfaces the session-expired alert AND clears local auth state via
    // sessionLost(), so the sign-in form re-renders instead of stranding the operator (issue #109).
    await signIn();
    expect(auth.signedIn()).toBe(true);
    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    fixture.detectChanges();

    clickButton('Create venue');
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('session has expired');
    expect(auth.signedIn()).toBe(false);
    expect(host().querySelector('#operator-username, [name="operator-username"]')).not.toBeNull();
  });

  it('signs the operator in and out through the form', async () => {
    setField('Username', 'operator');
    setField('Password', 'pw');
    fixture.detectChanges();
    clickButton('Sign in');
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/auth/operator/login`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.signedIn()).toBe(true);
    expect(host().textContent).toContain('Signed in as');
    expect(host().textContent).toContain('Create venue');

    clickButton('Sign out');
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/auth/logout`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.signedIn()).toBe(false);
    expect(host().textContent).toContain('Operator sign-in');

    // Submitting with an empty password is a no-op (the guard short-circuits, no login POST).
    clickButton('Sign in');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.signedIn()).toBe(false);
  });
});
