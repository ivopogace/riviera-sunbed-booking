import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { OperatorAuth } from './operator-auth';
import { OwnedVenues } from './owned-venues';

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

  it('does NOT adopt a CUSTOMER /me principal — a customer session never signs an operator in (F2)', async () => {
    // /me is polymorphic (S2 #111); OperatorAuth must filter to its own principal type.
    const auth = TestBed.inject(OperatorAuth);
    httpMock.expectOne(`${AUTH_API}/me`).flush({ username: 'ana@example.com', principalType: 'CUSTOMER' });
    await Promise.resolve();

    expect(auth.signedIn()).toBe(false);
    expect(auth.username()).toBeUndefined();
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

  describe('register (self-registration, S6 #115)', () => {
    it('posts the fields and resolves submitted on 202 — never a session, never a /me', async () => {
      const auth = serviceWithRestore('signed-out');

      const result = auth.register('alice', 'password123', 'alice@venue.example');
      const req = httpMock.expectOne(`${AUTH_API}/operator/register`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        username: 'alice',
        password: 'password123',
        contactEmail: 'alice@venue.example',
      });
      req.flush({ status: 'PENDING' }, { status: 202, statusText: 'Accepted' });

      expect(await result).toBe('submitted');
      // A PENDING account is never signed in; httpMock.verify() proves no /me was fetched.
      expect(auth.signedIn()).toBe(false);
    });

    it('maps a 429 to rate-limited', async () => {
      const auth = serviceWithRestore('signed-out');

      const result = auth.register('alice', 'password123', 'alice@venue.example');
      httpMock
        .expectOne(`${AUTH_API}/operator/register`)
        .flush({ code: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

      expect(await result).toBe('rate-limited');
    });

    it('maps a 400 to invalid-password', async () => {
      const auth = serviceWithRestore('signed-out');

      const result = auth.register('alice', 'short', 'alice@venue.example');
      httpMock
        .expectOne(`${AUTH_API}/operator/register`)
        .flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });

      expect(await result).toBe('invalid-password');
    });
  });

  describe('isAdmin (S6 #115)', () => {
    it('is true when /me reports an admin operator principal', async () => {
      const auth = TestBed.inject(OperatorAuth);
      httpMock
        .expectOne(`${AUTH_API}/me`)
        .flush({ username: 'operator', principalType: 'OPERATOR', admin: true });
      await Promise.resolve();

      expect(auth.isAdmin()).toBe(true);
    });

    it('is false for a plain operator (no admin flag) and when signed out', async () => {
      const auth = serviceWithRestore({ username: 'operator' });
      await Promise.resolve();

      expect(auth.isAdmin()).toBe(false);
    });
  });

  describe('signOut (S9 #277)', () => {
    it('drops the cached owned-venues list so the next operator sees their own', async () => {
      const auth = serviceWithRestore({ username: 'operator' });
      await Promise.resolve();

      const done = auth.signOut();
      httpMock.expectOne(`${AUTH_API}/logout`).flush(null, { status: 204, statusText: 'No Content' });
      await done;

      expect(TestBed.inject(OwnedVenues).venues()).toBeUndefined();
      expect(auth.signedIn()).toBe(false);
    });
  });
});
