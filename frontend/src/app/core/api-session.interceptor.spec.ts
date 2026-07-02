import { DOCUMENT } from '@angular/common';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { apiSessionInterceptor } from './api-session.interceptor';

const api = environment.apiBaseUrl;

describe('apiSessionInterceptor (issue #109)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let documentRef: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiSessionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    documentRef = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    // jsdom cookies persist per document — expire what a test set so specs stay independent.
    documentRef.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    httpMock.verify();
  });

  it('marks API requests withCredentials so the browser attaches the session cookie', () => {
    http.get(`${api}/api/venues`).subscribe();
    const req = httpMock.expectOne(`${api}/api/venues`);
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
  });

  it('echoes the XSRF-TOKEN cookie as X-XSRF-TOKEN on a mutating request', () => {
    documentRef.cookie = 'XSRF-TOKEN=token-123; path=/';
    http.post(`${api}/api/venues`, {}).subscribe();
    const req = httpMock.expectOne(`${api}/api/venues`);
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('token-123');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ id: 1 });
  });

  it('sends no CSRF header on a GET (reads are not CSRF-protected)', () => {
    documentRef.cookie = 'XSRF-TOKEN=token-123; path=/';
    http.get(`${api}/api/venues/1`).subscribe();
    const req = httpMock.expectOne(`${api}/api/venues/1`);
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    req.flush({});
  });

  it('sends no CSRF header when the cookie is absent (backend answers 403, surfaces retry)', () => {
    http.post(`${api}/api/auth/logout`, null).subscribe({ error: () => undefined });
    const req = httpMock.expectOne(`${api}/api/auth/logout`);
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    req.flush(null, { status: 403, statusText: 'Forbidden' });
  });

  it('never attaches an Authorization header (the session cookie IS the credential, AC-9)', () => {
    documentRef.cookie = 'XSRF-TOKEN=token-123; path=/';
    http.post(`${api}/api/venues`, {}).subscribe();
    const req = httpMock.expectOne(`${api}/api/venues`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ id: 1 });
  });

  it('leaves foreign URLs untouched, even ones that merely contain /api/', () => {
    documentRef.cookie = 'XSRF-TOKEN=token-123; path=/';
    http.post('https://evil.example.com/api/venues', {}).subscribe();
    const req = httpMock.expectOne('https://evil.example.com/api/venues');
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    req.flush({});
  });
});
