import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { OperatorAccountView, PendingOperatorView } from './admin.model';

/** The platform-admin operator-approval surface (S6 #115); ADMIN-gated server-side. */
const ADMIN_OPERATORS_API = `${environment.apiBaseUrl}/api/admin/operators`;

/**
 * HTTP client for the platform-admin operator-approval surface (S6 #115). Stateless — the session
 * cookie + CSRF header are added by {@link apiSessionInterceptor}; the component holds the list state.
 * Every call is gated to the ADMIN role by the backend (a non-admin operator gets 403).
 */
@Service()
export class AdminOperatorsService {
  private readonly http = inject(HttpClient);

  /** The operators awaiting approval (oldest first). */
  pending(): Promise<PendingOperatorView[]> {
    return firstValueFrom(this.http.get<PendingOperatorView[]>(ADMIN_OPERATORS_API));
  }

  /** Approve a pending operator → it can sign in. */
  approve(id: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${ADMIN_OPERATORS_API}/${id}/approve`, null));
  }

  /** Reject a pending operator → it stays blocked. */
  reject(id: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${ADMIN_OPERATORS_API}/${id}/reject`, null));
  }

  /** The operators that can currently sign in (#128). */
  accounts(): Promise<OperatorAccountView[]> {
    return firstValueFrom(this.http.get<OperatorAccountView[]>(`${ADMIN_OPERATORS_API}/accounts`));
  }

  /** Suspend an active operator → it cannot sign in, and its live sessions are revoked server-side. */
  suspend(id: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${ADMIN_OPERATORS_API}/${id}/suspend`, null));
  }

  /** Reinstate a suspended operator → it can sign in again (old sessions stay revoked). */
  reinstate(id: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${ADMIN_OPERATORS_API}/${id}/reinstate`, null));
  }
}
