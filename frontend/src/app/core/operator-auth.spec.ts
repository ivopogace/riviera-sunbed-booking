import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { OperatorAuth } from './operator-auth';
import { operatorAuthInterceptor } from './operator-auth.interceptor';

const api = environment.apiBaseUrl;

describe('OperatorAuth', () => {
  let auth: OperatorAuth;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    auth = TestBed.inject(OperatorAuth);
  });

  it('starts signed out with no header', () => {
    expect(auth.signedIn()).toBe(false);
    expect(auth.username()).toBeUndefined();
    expect(auth.basicAuthHeader()).toBeUndefined();
  });

  it('signIn stores the credential and exposes a Basic header', () => {
    auth.signIn('operator', 'pw');
    expect(auth.signedIn()).toBe(true);
    expect(auth.username()).toBe('operator');
    expect(auth.basicAuthHeader()).toBe(`Basic ${btoa('operator:pw')}`);
  });

  it('signOut clears the credential', () => {
    auth.signIn('operator', 'pw');
    auth.signOut();
    expect(auth.signedIn()).toBe(false);
    expect(auth.basicAuthHeader()).toBeUndefined();
  });
});

describe('operatorAuthInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: OperatorAuth;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([operatorAuthInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(OperatorAuth);
  });

  afterEach(() => httpMock.verify());

  it('attaches Basic auth to a venue write when signed in', () => {
    auth.signIn('operator', 'pw');
    http.post(`${api}/api/venues`, {}).subscribe();
    const req = httpMock.expectOne(`${api}/api/venues`);
    expect(req.request.headers.get('Authorization')).toBe(`Basic ${btoa('operator:pw')}`);
    req.flush({ id: 1 });
  });

  it('leaves public GET reads untouched', () => {
    auth.signIn('operator', 'pw');
    http.get(`${api}/api/venues/1`).subscribe();
    const req = httpMock.expectOne(`${api}/api/venues/1`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('leaves non-venue requests untouched', () => {
    auth.signIn('operator', 'pw');
    http.post(`${api}/api/bookings`, {}).subscribe();
    const req = httpMock.expectOne(`${api}/api/bookings`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does not leak credentials to a foreign URL that merely contains the path', () => {
    auth.signIn('operator', 'pw');
    http.post('https://evil.example.com/api/venues', {}).subscribe();
    const req = httpMock.expectOne('https://evil.example.com/api/venues');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('sends no auth header when signed out', () => {
    http.post(`${api}/api/venues`, {}).subscribe();
    const req = httpMock.expectOne(`${api}/api/venues`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ id: 1 });
  });
});
