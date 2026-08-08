import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AdminAuditEntryView } from './admin.model';

/** The platform-admin audit-trail read; ADMIN-gated server-side. */
const ADMIN_AUDIT_API = `${environment.apiBaseUrl}/api/admin/audit`;

/**
 * HTTP client for the admin console's Audit tab — the latest recorded mutating
 * `/api/admin/**` actions, newest first. Stateless: the session cookie + CSRF header are added by
 * {@link apiSessionInterceptor}, and the component holds the page state. The read is itself a `GET`,
 * so browsing the trail never writes to it.
 */
@Service()
export class AdminAuditService {
  private readonly http = inject(HttpClient);

  /** The latest recorded actions, newest first (the backend's default window). */
  latest(): Promise<readonly AdminAuditEntryView[]> {
    return firstValueFrom(this.http.get<readonly AdminAuditEntryView[]>(ADMIN_AUDIT_API));
  }
}
