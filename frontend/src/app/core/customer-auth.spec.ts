import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { CustomerAuth } from './customer-auth';

const AUTH_API = `${environment.apiBaseUrl}/api/auth`;

/** Let the service's async continuations (firstValueFrom → signal.set) run before asserting. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('CustomerAuth', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
    http.expectOne(`${AUTH_API}/customer/login`).flush({}, { status: 401, statusText: 'Unauthorized' });
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
      .flush({ username: 'new@example.com', principalType: 'CUSTOMER' }, { status: 201, statusText: 'Created' });
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
      .flush({ username: 'taken@example.com', principalType: 'CUSTOMER' }, { status: 201, statusText: 'Created' });
    await tick(); // let register's await resolve so loadPrincipal issues the follow-up /me
    http.expectOne(`${AUTH_API}/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe('exists');
    expect(auth.signedIn()).toBe(false);
  });

  it('maps a 400 register to invalid-password with no /me follow-up', async () => {
    const auth = await create('signed-out');
    const result = auth.register('new@example.com', 'short');
    http
      .expectOne(`${AUTH_API}/customer/register`)
      .flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });
    expect(await result).toBe('invalid-password');
  });

  it('signs out and clears the principal', async () => {
    const auth = await create({ principalType: 'CUSTOMER' });
    expect(auth.signedIn()).toBe(true);
    const done = auth.signOut();
    http.expectOne(`${AUTH_API}/logout`).flush(null);
    await done;
    expect(auth.signedIn()).toBe(false);
  });
});
