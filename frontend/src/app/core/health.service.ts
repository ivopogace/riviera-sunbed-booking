import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../environments/environment';

/** Backend reachability as seen by the browser. */
export type BackendStatus = 'UP' | 'DOWN' | 'UNKNOWN';

interface ActuatorHealth {
  status?: string;
}

/**
 * Pings the backend's public actuator health endpoint. This is the tracer-bullet
 * FE↔BE call (no feature endpoints exist yet): it proves the API base URL is correct
 * for the environment and that the backend's CORS policy admits the frontend origin.
 */
@Service()
export class HealthService {
  private readonly http = inject(HttpClient);
  private readonly healthUrl = `${environment.apiBaseUrl}/actuator/health`;

  checkHealth(): Observable<BackendStatus> {
    return this.http.get<ActuatorHealth>(this.healthUrl).pipe(
      map((res): BackendStatus => (res.status === 'UP' ? 'UP' : 'DOWN')),
      catchError(() => of<BackendStatus>('UNKNOWN')),
    );
  }
}
