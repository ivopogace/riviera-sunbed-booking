import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { RecordingPageNavigation } from '../../testing/recording-page-navigation';
import { OperatorAuth, operatorLinkStartMessage } from './operator-auth';
import { PageNavigation } from './page-navigation';

const AUTH_API = `${environment.apiBaseUrl}/api/auth`;

function problem(status: number, code?: string) {
  return {
    body: code ? { code } : null,
    init: { status, statusText: 'x', headers: { 'Content-Type': 'application/problem+json' } },
  };
}

describe('OperatorAuth SSO (#276)', () => {
  let httpMock: HttpTestingController;
  let navigation: RecordingPageNavigation;
  let auth: OperatorAuth;

  beforeEach(() => {
    navigation = new RecordingPageNavigation();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PageNavigation, useValue: navigation },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(OperatorAuth);
    httpMock.expectOne(`${AUTH_API}/me`).flush(null, problem(401).init);
  });

  afterEach(() => httpMock.verify());

  it('signs in through the operator authorize endpoint, never the tourist one', () => {
    auth.startSso('apple');

    expect(navigation.left).toEqual([`${AUTH_API}/operator/sso/apple/authorize`]);
  });

  it('proves the current password, then leaves for the authorize URL the server returned', async () => {
    const result = auth.startLink('google', ' pw with spaces ');
    const request = httpMock.expectOne(`${AUTH_API}/operator/sso/google/link`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ currentPassword: ' pw with spaces ' });
    request.flush({ authorizeUrl: 'https://idp.example/authorize?state=s' });

    expect(await result).toBe('started');
    expect(navigation.left).toEqual(['https://idp.example/authorize?state=s']);
  });

  it.each([
    [400, 'MISSING_CURRENT_PASSWORD', 'missing-current'],
    [400, 'INVALID_CURRENT_PASSWORD', 'invalid-current'],
    [409, 'BOOTSTRAP_CREDENTIAL_MANAGED', 'bootstrap-managed'],
    [409, 'ADMIN_LINK_REFUSED_ON_MOCK_IDP', 'admin-on-demo'],
    [429, 'RATE_LIMITED', 'rate-limited'],
    [401, 'UNAUTHENTICATED', 'session-lost'],
    [500, undefined, 'error'],
  ] as const)('maps a %s %s link refusal to %s and stays put', async (status, code, expected) => {
    const result = auth.startLink('google', 'pw');
    const { body, init } = problem(status, code);
    httpMock.expectOne(`${AUTH_API}/operator/sso/google/link`).flush(body, init);

    expect(await result).toBe(expected);
    expect(navigation.left).toEqual([]);
    expect(operatorLinkStartMessage(expected)).toBeTruthy();
  });

  it('reads the linked sign-ins, and an empty list on a failed read', async () => {
    const linked = auth.signInMethods();
    httpMock
      .expectOne(`${AUTH_API}/operator/sso`)
      .flush([{ provider: 'google', linkedAt: '2026-06-15T10:00:00Z' }]);
    expect(await linked).toEqual([{ provider: 'google', linkedAt: '2026-06-15T10:00:00Z' }]);

    const failed = auth.signInMethods();
    httpMock.expectOne(`${AUTH_API}/operator/sso`).flush(null, problem(500).init);
    expect(await failed).toEqual([]);
  });

  it.each([
    [204, 'unlinked'],
    [409, 'last-credential'],
    [401, 'session-lost'],
    [500, 'error'],
  ] as const)('maps a %s unlink to %s', async (status, expected) => {
    const result = auth.unlink('apple');
    const request = httpMock.expectOne(`${AUTH_API}/operator/sso/apple`);
    expect(request.request.method).toBe('DELETE');
    if (status === 204) {
      request.flush(null, { status, statusText: 'No Content' });
    } else {
      request.flush(null, problem(status).init);
    }

    expect(await result).toBe(expected);
  });

  it('has no message for a started link', () => {
    expect(operatorLinkStartMessage('started')).toBeUndefined();
  });
});
