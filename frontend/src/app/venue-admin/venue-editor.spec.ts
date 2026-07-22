import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

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
    // Since S9 (#277) operatorSessionGuard gates this route, so the page only mounts for a signed-in
    // operator — the startup restore answers a principal rather than the old 401.
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

  function clickButton(text: string): void {
    const button = Array.from(host().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(text),
    );
    button!.click();
  }

  it('carries no inline sign-in card — the guard owns the gate (#277)', () => {
    expect(host().textContent).not.toContain('Operator sign-in');
    expect(host().querySelector('[name="operator-username"]')).toBeNull();
    // The signed-in-as strip and the create form render straight away.
    expect(host().textContent).toContain('Signed in as');
    expect(host().textContent).toContain('Create venue');
  });

  it('creates a venue and links the operator into its console', async () => {
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
    // Signed in, but the session dies before the write (expired/invalidated server-side): the 401 on
    // the venue POST surfaces the session-expired alert AND clears local auth state via
    // sessionLost(). Since #277 the operator is not re-prompted here — the guard redirects on the
    // next activation — but dropping the local state is what makes that redirect happen.
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
  });

  it('signs out and leaves for the unified auth page (#277)', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    clickButton('Sign out');
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/auth/logout`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(auth.signedIn()).toBe(false);
    // The guard gates on ACTIVATION, so the page must navigate away rather than sit on a dead session.
    expect(navigate).toHaveBeenCalledWith(['/account/sign-in'], {
      queryParams: { audience: 'operator' },
    });
  });
});
