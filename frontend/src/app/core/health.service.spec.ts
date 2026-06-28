import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let httpMock: HttpTestingController;
  const healthUrl = `${environment.apiBaseUrl}/actuator/health`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HealthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('GETs the actuator health endpoint at the configured base URL', () => {
    firstValueFrom(service.checkHealth());
    const req = httpMock.expectOne(healthUrl);
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'UP' });
  });

  it('maps an UP response to UP', async () => {
    const result = firstValueFrom(service.checkHealth());
    httpMock.expectOne(healthUrl).flush({ status: 'UP' });
    expect(await result).toBe('UP');
  });

  it('maps a non-UP response to DOWN', async () => {
    const result = firstValueFrom(service.checkHealth());
    httpMock.expectOne(healthUrl).flush({ status: 'OUT_OF_SERVICE' });
    expect(await result).toBe('DOWN');
  });

  it('maps a network/CORS failure to UNKNOWN', async () => {
    const result = firstValueFrom(service.checkHealth());
    httpMock.expectOne(healthUrl).error(new ProgressEvent('network error'));
    expect(await result).toBe('UNKNOWN');
  });
});
