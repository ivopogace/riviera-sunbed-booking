import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AUTH_API, SessionAuth } from './session-auth';
import { SignOutNotice } from './sign-out-notice';

/** A minimal concrete subclass — the base is abstract, and this keeps the test off either real service. */
@Injectable()
class TestAuth extends SessionAuth {
  protected readonly principalType = 'CUSTOMER';
  protected readonly restoreOnStartup = Promise.resolve();
}

const PROBLEM_401 = { status: 401, statusText: 'Unauthorized' };
const PROBLEM_403 = { status: 403, statusText: 'Forbidden' };
const NO_CONTENT = { status: 204, statusText: 'No Content' };

/** Let every pending microtask run, so the next request in the chain has actually been issued. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Sign-out robustness. `signOut()` used to swallow every failure and clear local state,
 * so a logout that never reached the server left the `HttpOnly` SESSION cookie alive — and the next
 * visitor on a shared device (operators plausibly share a tablet at the venue) was silently restored
 * by `GET /api/auth/me`. It now distinguishes "the session is provably gone" from "we don't know",
 * retries once, and reports the difference.
 */
describe('SessionAuth sign-out', () => {
  let auth: TestAuth;
  let http: HttpTestingController;
  let notice: SignOutNotice;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), TestAuth],
    });
    auth = TestBed.inject(TestAuth);
    http = TestBed.inject(HttpTestingController);
    notice = TestBed.inject(SignOutNotice);
  });

  afterEach(() => http.verify());

  it('reports signed-out when the server confirms the logout', async () => {
    const done = auth.signOut();
    http.expectOne(`${AUTH_API}/logout`).flush(null, NO_CONTENT);

    expect(await done).toBe('signed-out');
    expect(auth.signedIn()).toBe(false);
    expect(notice.visible()).toBe(false);
  });

  it('treats a 401 logout as a completed sign-out', async () => {
    const done = auth.signOut();
    // 401 means the server has no such session — that IS signed out, not a failure to retry.
    http.expectOne(`${AUTH_API}/logout`).flush({ code: 'UNAUTHENTICATED' }, PROBLEM_401);

    expect(await done).toBe('signed-out');
    expect(notice.visible()).toBe(false);
  });

  it('retries a 403 logout once after re-bootstrapping CSRF', async () => {
    const done = auth.signOut();
    // A missing/stale XSRF cookie is the common cause; GET /me re-issues one.
    http.expectOne(`${AUTH_API}/logout`).flush({ code: 'FORBIDDEN' }, PROBLEM_403);
    await settle();
    http.expectOne(`${AUTH_API}/me`).flush({ username: 'a@b.example', principalType: 'CUSTOMER' });
    await settle();
    http.expectOne(`${AUTH_API}/logout`).flush(null, NO_CONTENT);

    expect(await done).toBe('signed-out');
    expect(auth.signedIn()).toBe(false);
    expect(notice.visible()).toBe(false);
  });

  it('reports may-persist when the retry also fails, and still clears local state', async () => {
    const done = auth.signOut();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('network'));
    await settle();
    http.expectOne(`${AUTH_API}/me`).error(new ProgressEvent('network'));
    await settle();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('network'));

    // Local state clears regardless: a UI stuck in "signed in" is worse than a stale server cookie.
    expect(await done).toBe('may-persist');
    expect(auth.signedIn()).toBe(false);
    expect(notice.visible()).toBe(true);
  });

  it('retries at most once — never loops', async () => {
    const done = auth.signOut();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('network'));
    await settle();
    http.expectOne(`${AUTH_API}/me`).error(new ProgressEvent('network'));
    await settle();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('network'));

    await done;
    http.verify(); // a third logout attempt would fail this
  });

  it('clears the notice once a retried sign-out finally succeeds', async () => {
    const failed = auth.signOut();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('network'));
    await settle();
    http.expectOne(`${AUTH_API}/me`).error(new ProgressEvent('network'));
    await settle();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('network'));
    await failed;
    expect(notice.visible()).toBe(true);

    const retried = notice.retry();
    http.expectOne(`${AUTH_API}/logout`).flush(null, NO_CONTENT);
    await retried;

    expect(notice.visible()).toBe(false);
  });

  it('dismisses the notice without another server call', async () => {
    const done = auth.signOut();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('network'));
    await settle();
    http.expectOne(`${AUTH_API}/me`).error(new ProgressEvent('network'));
    await settle();
    http.expectOne(`${AUTH_API}/logout`).error(new ProgressEvent('network'));
    await done;

    notice.dismiss();

    expect(notice.visible()).toBe(false);
  });

  it('posts logout to the configured API base', () => {
    void auth.signOut();
    const request = http.expectOne(`${environment.apiBaseUrl}/api/auth/logout`);
    expect(request.request.method).toBe('POST');
    request.flush(null, NO_CONTENT);
  });
});
