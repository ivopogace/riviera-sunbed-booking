import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { OperatorAuth, runOperatorSignIn } from './operator-auth';

const AUTH_API = `${environment.apiBaseUrl}/api/auth`;
const PROBLEM_401 = {
  status: 401,
  statusText: 'Unauthorized',
  headers: { 'Content-Type': 'application/problem+json' },
};

describe('OperatorAuth (session-aware, issue #109)', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Construction fires the /me restore; flush it as signed-out unless a test says otherwise. */
  function serviceWithRestore(flush: 'signed-out' | { username: string }): OperatorAuth {
    const auth = TestBed.inject(OperatorAuth);
    const restore = httpMock.expectOne(`${AUTH_API}/me`);
    expect(restore.request.method).toBe('GET');
    if (flush === 'signed-out') {
      restore.flush({ code: 'UNAUTHENTICATED' }, PROBLEM_401);
    } else {
      restore.flush({ username: flush.username, principalType: 'OPERATOR' });
    }
    return auth;
  }

  it('restores a live session from /api/auth/me on construction (reload survival, AC-8)', async () => {
    const auth = serviceWithRestore({ username: 'operator' });
    await Promise.resolve(); // let the restore promise settle

    expect(auth.signedIn()).toBe(true);
    expect(auth.username()).toBe('operator');
    expect(auth.restoring()).toBe(false);
  });

  it('starts signed out when /me answers 401 (the expected signed-out state, not an error)', async () => {
    const auth = serviceWithRestore('signed-out');
    await Promise.resolve();

    expect(auth.signedIn()).toBe(false);
    expect(auth.username()).toBeUndefined();
    expect(auth.restoring()).toBe(false);
  });

  it('signIn posts the credential once and holds only the principal — never the password', async () => {
    const auth = serviceWithRestore('signed-out');

    const result = auth.signIn('operator', 'pw');
    const login = httpMock.expectOne(`${AUTH_API}/operator/login`);
    expect(login.request.method).toBe('POST');
    expect(login.request.body).toEqual({ username: 'operator', password: 'pw' });
    login.flush({ username: 'operator', principalType: 'OPERATOR' });

    expect(await result).toBe('signed-in');
    expect(auth.signedIn()).toBe(true);
    expect(auth.username()).toBe('operator');
  });

  it('maps a generic 401 to invalid-credentials', async () => {
    const auth = serviceWithRestore('signed-out');

    const result = auth.signIn('operator', 'wrong');
    httpMock.expectOne(`${AUTH_API}/operator/login`)
      .flush({ code: 'INVALID_CREDENTIALS' }, PROBLEM_401);

    expect(await result).toBe('invalid-credentials');
    expect(auth.signedIn()).toBe(false);
  });

  it('maps a 429 to rate-limited', async () => {
    const auth = serviceWithRestore('signed-out');

    const result = auth.signIn('operator', 'pw');
    httpMock.expectOne(`${AUTH_API}/operator/login`)
      .flush({ code: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    expect(await result).toBe('rate-limited');
  });

  it('signOut posts to the logout endpoint and clears state', async () => {
    const auth = serviceWithRestore({ username: 'operator' });
    await Promise.resolve();

    const done = auth.signOut();
    const logout = httpMock.expectOne(`${AUTH_API}/logout`);
    expect(logout.request.method).toBe('POST');
    logout.flush(null, { status: 204, statusText: 'No Content' });
    await done;

    expect(auth.signedIn()).toBe(false);
  });

  it('signOut clears local state even when the server session is already gone', async () => {
    const auth = serviceWithRestore({ username: 'operator' });
    await Promise.resolve();

    const done = auth.signOut();
    httpMock.expectOne(`${AUTH_API}/logout`).flush({ code: 'UNAUTHENTICATED' }, PROBLEM_401);
    await done;

    expect(auth.signedIn()).toBe(false);
  });

  it('sessionLost drops the principal without any HTTP call', async () => {
    const auth = serviceWithRestore({ username: 'operator' });
    await Promise.resolve();

    auth.sessionLost();

    expect(auth.signedIn()).toBe(false); // httpMock.verify() proves no request went out
  });

  describe('runOperatorSignIn (shared operator sign-in handler, #170)', () => {
    function form() {
      return {
        signingIn: signal(false),
        error: signal<string | undefined>(undefined),
        password: signal('pw'),
      };
    }

    it('clears the password and leaves no error on success', async () => {
      const auth = serviceWithRestore('signed-out');
      const state = form();

      const done = runOperatorSignIn(auth, 'operator', 'pw', state);
      httpMock
        .expectOne(`${AUTH_API}/operator/login`)
        .flush({ username: 'operator', principalType: 'OPERATOR' });
      await done;

      expect(state.signingIn()).toBe(false);
      expect(state.password()).toBe('');
      expect(state.error()).toBeUndefined();
    });

    it('sets the generic failure message and keeps the password on a bad credential', async () => {
      const auth = serviceWithRestore('signed-out');
      const state = form();

      const done = runOperatorSignIn(auth, 'operator', 'wrong', state);
      httpMock.expectOne(`${AUTH_API}/operator/login`).flush({ code: 'INVALID' }, PROBLEM_401);
      await done;

      expect(state.error()).toContain('Sign-in failed');
      expect(state.password()).toBe('pw'); // kept for a retry
      expect(state.signingIn()).toBe(false);
    });

    it('no-ops (no HTTP) when a field is blank', async () => {
      const auth = serviceWithRestore('signed-out');
      const state = form();

      await runOperatorSignIn(auth, '', 'pw', state);

      expect(state.signingIn()).toBe(false); // httpMock.verify() proves no login went out
    });

    it('no-ops while a sign-in is already in flight', async () => {
      const auth = serviceWithRestore('signed-out');
      const state = { ...form(), signingIn: signal(true) };

      await runOperatorSignIn(auth, 'operator', 'pw', state);

      expect(state.signingIn()).toBe(true); // unchanged; httpMock.verify() proves no login went out
    });
  });
});
