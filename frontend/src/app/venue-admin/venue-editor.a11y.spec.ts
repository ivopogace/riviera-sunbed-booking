import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { apiSessionInterceptor } from '../core/api-session.interceptor';
import { VenueEditor } from './venue-editor';

const AUTH_API = `${environment.apiBaseUrl}/api/auth`;

/**
 * Automated axe-core structural audit of the venue editor (issue #38 pattern). Guards the form
 * a11y (labelled inputs, button names, ARIA validity, non-colour state) against regression in
 * the states the operator sees. Under session auth (issue #109) each state needs its auth
 * round-trips flushed — the `/me` restore for signed-out, plus the login POST for signed-in —
 * or axe would audit the transient "Checking your session…" placeholder instead. Colour contrast
 * is checked deterministically in `venue-editor.contrast.spec.ts` (axe can't measure contrast
 * under jsdom).
 */
describe('VenueEditor accessibility (axe)', () => {
  let fixture: ComponentFixture<VenueEditor>;
  let auth: OperatorAuth;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueEditor],
      providers: [
        provideHttpClient(withInterceptors([apiSessionInterceptor])),
        provideHttpClientTesting(),
        // The signed-in card carries a routerLink (#326 change-password entry point), so RouterLink
        // needs an ActivatedRoute to instantiate.
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueEditor);
    auth = TestBed.inject(OperatorAuth);
    httpMock = TestBed.inject(HttpTestingController);
    // Settle the constructor's /me restore as signed-out so restoring() flips false.
    httpMock
      .expectOne(`${AUTH_API}/me`)
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Establish the session state for the signed-in audits (server-validated since #109). */
  async function signIn(): Promise<void> {
    const result = auth.signIn('operator', 'pw');
    httpMock
      .expectOne(`${AUTH_API}/operator/login`)
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    await result;
  }

  it('has no violations in the signed-out sign-in state', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations in the signed-in create-venue state', async () => {
    await signIn();
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });
});
