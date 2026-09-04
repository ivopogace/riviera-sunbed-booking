import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { CustomerAuth } from './customer-auth';
import { SsoRedirect } from './sso-redirect';

const AUTH_API = `${environment.apiBaseUrl}/api/auth`;

/** Records SSO start URLs instead of navigating (no `window.location` in jsdom). */
class RecordingSsoRedirect extends SsoRedirect {
  readonly urls: string[] = [];
  go(url: string): void {
    this.urls.push(url);
  }
}

/** Let the service's async continuations (firstValueFrom → signal.set) run before asserting. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('CustomerAuth', () => {
  let http: HttpTestingController;
  let redirect: RecordingSsoRedirect;

  beforeEach(() => {
    redirect = new RecordingSsoRedirect();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SsoRedirect, useValue: redirect },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Inject the service and settle its startup GET /me with a principal (or a 401 = signed out). */
  async function create(startup: { principalType: string } | 'signed-out'): Promise<CustomerAuth> {
    const auth = TestBed.inject(CustomerAuth);
    const me = http.expectOne(`${AUTH_API}/me`);
    if (startup === 'signed-out') {
      me.flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    } else {
      me.flush({ username: 'ana@example.com', principalType: startup.principalType });
    }
    await tick();
    return auth;
  }

  it('restores a CUSTOMER session on startup', async () => {
    const auth = await create({ principalType: 'CUSTOMER' });
    expect(auth.signedIn()).toBe(true);
    expect(auth.email()).toBe('ana@example.com');
    expect(auth.restoring()).toBe(false);
  });

  it('ignores an OPERATOR session on startup (not this service’s concern)', async () => {
    const auth = await create({ principalType: 'OPERATOR' });
    expect(auth.signedIn()).toBe(false);
    expect(auth.restoring()).toBe(false);
  });

  it('a 401 startup restore is signed-out, not a restore failure', async () => {
    const auth = await create('signed-out');
    expect(auth.signedIn()).toBe(false);
    expect(auth.restoreFailed()).toBe(false);
  });

  it('a non-401 startup restore is a restore failure, distinct from signed-out (#745)', async () => {
    const auth = TestBed.inject(CustomerAuth);
    http.expectOne(`${AUTH_API}/me`).flush({}, { status: 500, statusText: 'Error' });
    await tick();

    expect(auth.signedIn()).toBe(false);
    expect(auth.restoreFailed()).toBe(true);
  });

  it('signs in and adopts the principal', async () => {
    const auth = await create('signed-out');
    const result = auth.signIn('ana@example.com', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/login`)
      .flush({ username: 'ana@example.com', principalType: 'CUSTOMER' });
    expect(await result).toBe('signed-in');
    expect(auth.signedIn()).toBe(true);
    expect(auth.email()).toBe('ana@example.com');
  });

  it('maps a 401 sign-in to invalid-credentials and stays signed out', async () => {
    const auth = await create('signed-out');
    const result = auth.signIn('ana@example.com', 'wrong');
    http
      .expectOne(`${AUTH_API}/customer/login`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe('invalid-credentials');
    expect(auth.signedIn()).toBe(false);
  });

  it('maps a 429 sign-in to rate-limited', async () => {
    const auth = await create('signed-out');
    const result = auth.signIn('ana@example.com', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/login`)
      .flush({}, { status: 429, statusText: 'Too Many Requests' });
    expect(await result).toBe('rate-limited');
  });

  it('registers a fresh email and signs in (register 201, then /me is CUSTOMER)', async () => {
    const auth = await create('signed-out');
    const result = auth.register('new@example.com', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/register`)
      .flush(
        { username: 'new@example.com', principalType: 'CUSTOMER' },
        { status: 201, statusText: 'Created' },
      );
    await tick(); // let register's await resolve so loadPrincipal issues the follow-up /me
    http
      .expectOne(`${AUTH_API}/me`)
      .flush({ username: 'new@example.com', principalType: 'CUSTOMER' });
    expect(await result).toBe('registered');
    expect(auth.signedIn()).toBe(true);
  });

  it('reports exists for an already-registered email (register 201, /me 401) and stays signed out', async () => {
    const auth = await create('signed-out');
    const result = auth.register('taken@example.com', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/register`)
      .flush(
        { username: 'taken@example.com', principalType: 'CUSTOMER' },
        { status: 201, statusText: 'Created' },
      );
    await tick(); // let register's await resolve so loadPrincipal issues the follow-up /me
    http.expectOne(`${AUTH_API}/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe('exists');
    expect(auth.signedIn()).toBe(false);
  });

  it('registers a fresh DIFFERENT account while already signed in (session switches principal → registered)', async () => {
    const auth = await create({ principalType: 'CUSTOMER' }); // signed in as ana@example.com
    const result = auth.register('new@example.com', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/register`)
      .flush(
        { username: 'new@example.com', principalType: 'CUSTOMER' },
        { status: 201, statusText: 'Created' },
      );
    await tick(); // let register's await resolve so loadPrincipal issues the follow-up /me
    http
      .expectOne(`${AUTH_API}/me`)
      .flush({ username: 'new@example.com', principalType: 'CUSTOMER' });
    expect(await result).toBe('registered');
    expect(auth.email()).toBe('new@example.com');
  });

  it('reports exists for a taken email while signed in (session unchanged → same principal)', async () => {
    const auth = await create({ principalType: 'CUSTOMER' }); // signed in as ana@example.com
    const result = auth.register('taken@example.com', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/register`)
      .flush(
        { username: 'taken@example.com', principalType: 'CUSTOMER' },
        { status: 201, statusText: 'Created' },
      );
    await tick(); // let register's await resolve so loadPrincipal issues the follow-up /me
    http
      .expectOne(`${AUTH_API}/me`)
      .flush({ username: 'ana@example.com', principalType: 'CUSTOMER' });
    expect(await result).toBe('exists');
    expect(auth.email()).toBe('ana@example.com');
  });

  it('maps a 400 register to invalid-password with no /me follow-up', async () => {
    const auth = await create('signed-out');
    const result = auth.register('new@example.com', 'short');
    http
      .expectOne(`${AUTH_API}/customer/register`)
      .flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });
    expect(await result).toBe('invalid-password');
  });

  it('sends the solved challenge as the fence’s header, and no header without one', async () => {
    const auth = await create('signed-out');
    void auth.register('new@example.com', 'password123', 'solved-payload');
    const fenced = http.expectOne(`${AUTH_API}/customer/register`);
    expect(fenced.request.headers.get('X-Altcha-Payload')).toBe('solved-payload');
    fenced.flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });

    void auth.register('new@example.com', 'password123');
    const open = http.expectOne(`${AUTH_API}/customer/register`);
    expect(open.request.headers.has('X-Altcha-Payload')).toBe(false);
    open.flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });
  });

  it.each([
    ['CHALLENGE_REQUIRED', 'challenge-required'],
    ['CHALLENGE_INVALID', 'challenge-invalid'],
    ['CHALLENGE_EXPIRED', 'challenge-expired'],
  ])('maps a 400 %s register to %s with no /me follow-up', async (code, expected) => {
    const auth = await create('signed-out');
    const result = auth.register('new@example.com', 'password123', 'some-payload');
    http
      .expectOne(`${AUTH_API}/customer/register`)
      .flush({ code }, { status: 400, statusText: 'Bad Request' });
    expect(await result).toBe(expected);
  });

  // The blocklist has its own code so the page can say which rule failed, not just "wrong length".
  it('maps a 400 PASSWORD_CONTAINS_BLOCKED_TERM register to blocked-password', async () => {
    const auth = await create('signed-out');
    const result = auth.register('new@example.com', 'new-riviera-2026');
    http
      .expectOne(`${AUTH_API}/customer/register`)
      .flush(
        { code: 'PASSWORD_CONTAINS_BLOCKED_TERM' },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(await result).toBe('blocked-password');
  });

  it('starts SSO with a full-page navigation to the provider authorize endpoint', async () => {
    const auth = await create('signed-out');

    auth.startSso('google');
    auth.startSso('apple');

    expect(redirect.urls).toEqual([
      `${AUTH_API}/sso/google/authorize`,
      `${AUTH_API}/sso/apple/authorize`,
    ]);
  });

  it('signs out and clears the principal', async () => {
    const auth = await create({ principalType: 'CUSTOMER' });
    expect(auth.signedIn()).toBe(true);
    const done = auth.signOut();
    http.expectOne(`${AUTH_API}/logout`).flush(null);
    await done;
    expect(auth.signedIn()).toBe(false);
  });

  // --- account recovery ---

  const ME_API = `${environment.apiBaseUrl}/api/me`;

  it('forgot-password maps 204 → sent, 429 → rate-limited, 500 → error', async () => {
    const auth = await create('signed-out');

    const sent = auth.forgotPassword('ana@example.com');
    http
      .expectOne(`${AUTH_API}/customer/forgot-password`)
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await sent).toBe('sent');

    const limited = auth.forgotPassword('ana@example.com');
    http
      .expectOne(`${AUTH_API}/customer/forgot-password`)
      .flush({}, { status: 429, statusText: 'Too Many' });
    expect(await limited).toBe('rate-limited');

    const errored = auth.forgotPassword('ana@example.com');
    http
      .expectOne(`${AUTH_API}/customer/forgot-password`)
      .flush({}, { status: 500, statusText: 'Error' });
    expect(await errored).toBe('error');
  });

  it('forgot-password sends the solved challenge as the fence’s header, and none without one', async () => {
    const auth = await create('signed-out');

    void auth.forgotPassword('ana@example.com', 'solved-payload');
    const fenced = http.expectOne(`${AUTH_API}/customer/forgot-password`);
    expect(fenced.request.headers.get('X-Altcha-Payload')).toBe('solved-payload');
    fenced.flush(null, { status: 204, statusText: 'No Content' });

    void auth.forgotPassword('ana@example.com');
    const open = http.expectOne(`${AUTH_API}/customer/forgot-password`);
    expect(open.request.headers.has('X-Altcha-Payload')).toBe(false);
    open.flush(null, { status: 204, statusText: 'No Content' });
  });

  it.each([
    ['CHALLENGE_REQUIRED', 'challenge-required'],
    ['CHALLENGE_INVALID', 'challenge-invalid'],
    ['CHALLENGE_EXPIRED', 'challenge-expired'],
  ])('forgot-password maps a 400 %s to %s, not the generic error', async (code, expected) => {
    const auth = await create('signed-out');

    const result = auth.forgotPassword('ana@example.com', 'stale');
    http
      .expectOne(`${AUTH_API}/customer/forgot-password`)
      .flush({ code }, { status: 400, statusText: 'Bad Request' });

    expect(await result).toBe(expected);
  });

  // Every other failure still collapses to the one generic answer — the fence adds no new oracle (D-8).
  it('forgot-password maps a 400 without a challenge code to error', async () => {
    const auth = await create('signed-out');

    const result = auth.forgotPassword('ana@example.com', 'whatever');
    http
      .expectOne(`${AUTH_API}/customer/forgot-password`)
      .flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });

    expect(await result).toBe('error');
  });

  it('reset-password maps 204 → reset, and 400 by code → invalid-token vs invalid-password', async () => {
    const auth = await create('signed-out');

    const ok = auth.resetPassword('tok', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/reset-password`)
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await ok).toBe('reset');

    const badToken = auth.resetPassword('tok', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/reset-password`)
      .flush({ code: 'INVALID_OR_EXPIRED_TOKEN' }, { status: 400, statusText: 'Bad Request' });
    expect(await badToken).toBe('invalid-token');

    const weak = auth.resetPassword('tok', 'short');
    http
      .expectOne(`${AUTH_API}/customer/reset-password`)
      .flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });
    expect(await weak).toBe('invalid-password');

    const blocked = auth.resetPassword('tok', 'new-riviera-2026');
    http
      .expectOne(`${AUTH_API}/customer/reset-password`)
      .flush(
        { code: 'PASSWORD_CONTAINS_BLOCKED_TERM' },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(await blocked).toBe('blocked-password');

    const limited = auth.resetPassword('tok', 'password123');
    http
      .expectOne(`${AUTH_API}/customer/reset-password`)
      .flush({}, { status: 429, statusText: 'Too Many' });
    expect(await limited).toBe('rate-limited');
  });

  it('verify-email reloads the principal when signed in (picks up emailVerified)', async () => {
    const auth = await create({ principalType: 'CUSTOMER' });

    const result = auth.verifyEmail('tok');
    http
      .expectOne(`${AUTH_API}/customer/verify-email`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await tick(); // the signed-in branch reloads /me
    http
      .expectOne(`${AUTH_API}/me`)
      .flush({ username: 'ana@example.com', principalType: 'CUSTOMER', emailVerified: true });
    expect(await result).toBe('verified');
    expect(auth.emailVerified()).toBe(true);
  });

  it('verify-email maps a 400 → invalid-token (no /me reload when signed out)', async () => {
    const auth = await create('signed-out');
    const result = auth.verifyEmail('tok');
    http
      .expectOne(`${AUTH_API}/customer/verify-email`)
      .flush({}, { status: 400, statusText: 'Bad Request' });
    expect(await result).toBe('invalid-token');
  });

  it('set-password posts to /api/me/password and maps codes (set / invalid-current / invalid-password)', async () => {
    const auth = await create({ principalType: 'CUSTOMER' });

    const ok = auth.setPassword('brandnewpass1');
    const req = http.expectOne(`${ME_API}/password`);
    expect(req.request.body).toEqual({ newPassword: 'brandnewpass1', currentPassword: null }); // undefined → null
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(await ok).toBe('set');

    const wrongCurrent = auth.setPassword('brandnewpass1', 'wrong');
    http
      .expectOne(`${ME_API}/password`)
      .flush({ code: 'INVALID_CURRENT_PASSWORD' }, { status: 400, statusText: 'Bad Request' });
    expect(await wrongCurrent).toBe('invalid-current');

    const weak = auth.setPassword('short');
    http
      .expectOne(`${ME_API}/password`)
      .flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });
    expect(await weak).toBe('invalid-password');

    const blocked = auth.setPassword('new-riviera-2026');
    http
      .expectOne(`${ME_API}/password`)
      .flush(
        { code: 'PASSWORD_CONTAINS_BLOCKED_TERM' },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(await blocked).toBe('blocked-password');
  });

  // Without its own arm the default would call this invalid-password and show the length message.
  it('set-password maps MISSING_CURRENT_PASSWORD to its own result, not invalid-password', async () => {
    const auth = await create({ principalType: 'CUSTOMER' });

    const omitted = auth.setPassword('brandnewpass1');
    http
      .expectOne(`${ME_API}/password`)
      .flush({ code: 'MISSING_CURRENT_PASSWORD' }, { status: 400, statusText: 'Bad Request' });

    expect(await omitted).toBe('missing-current');
  });

  // This endpoint now carries a rate-limit budget, so 429 is reachable here.
  it('set-password maps a 429 → rate-limited rather than a generic error', async () => {
    const auth = await create({ principalType: 'CUSTOMER' });

    const throttled = auth.setPassword('brandnewpass1', 'currentpass1');
    http
      .expectOne(`${ME_API}/password`)
      .flush({}, { status: 429, statusText: 'Too Many Requests' });

    expect(await throttled).toBe('rate-limited');
  });

  it('request-verification maps the withheld flag → sent / withheld, and a failure → error', async () => {
    const auth = await create({ principalType: 'CUSTOMER' });

    const sent = auth.requestVerification();
    http.expectOne(`${ME_API}/verify-email/request`).flush({ emailWithheld: false });
    expect(await sent).toBe('sent');

    const withheld = auth.requestVerification();
    http.expectOne(`${ME_API}/verify-email/request`).flush({ emailWithheld: true });
    expect(await withheld).toBe('withheld');

    const errored = auth.requestVerification();
    http
      .expectOne(`${ME_API}/verify-email/request`)
      .flush({}, { status: 500, statusText: 'Error' });
    expect(await errored).toBe('error');
  });
});
