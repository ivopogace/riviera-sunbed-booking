import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CHALLENGE_URL } from '../shared/challenge';
import { ProofOfWork } from './proof-of-work';

describe('ProofOfWork', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Let the flushed response propagate through the resource, then run its effects. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  /** Inject the service and flush the effect that fires its probe. */
  function probe(): ProofOfWork {
    const service = TestBed.inject(ProofOfWork);
    TestBed.tick();
    return service;
  }

  it('is unknown until the endpoint answers', () => {
    const service = probe();
    expect(service.enabled()).toBeUndefined();
    http.expectOne(CHALLENGE_URL).flush({ parameters: {}, signature: 'x' });
  });

  it('is on when the endpoint issues a challenge', async () => {
    const service = probe();
    http
      .expectOne(CHALLENGE_URL)
      .flush({ parameters: { algorithm: 'PBKDF2/SHA-256' }, signature: 'x' });
    await settle();
    expect(service.enabled()).toBe(true);
  });

  it('is off when the endpoint answers 204', async () => {
    const service = probe();
    http.expectOne(CHALLENGE_URL).flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(service.enabled()).toBe(false);
  });

  it('stays on when the probe fails — the fence is the server’s to lift', async () => {
    const service = probe();
    http.expectOne(CHALLENGE_URL).flush('down', { status: 503, statusText: 'Service Unavailable' });
    await settle();
    expect(service.enabled()).toBe(true);
  });

  it('probes once per session, not per read', async () => {
    const service = probe();
    http.expectOne(CHALLENGE_URL).flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    service.enabled();
    service.enabled();
    http.expectNone(CHALLENGE_URL);
  });
});
