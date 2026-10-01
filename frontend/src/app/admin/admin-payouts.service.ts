import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';
import { PayoutBatchView, PayoutMarkError } from './admin.model';

/** The weekly BKT payout batches; ADMIN-gated server-side. */
const ADMIN_PAYOUT_BATCHES_API = `${environment.apiBaseUrl}/api/admin/payout-batches`;

/**
 * HTTP client for the weekly BKT payout report: read or generate a period's per-venue batches and
 * advance one. Stateless: the session cookie + CSRF header are added by `apiSessionInterceptor`.
 * Reporting sends the total the admin was shown, and the server refuses it if a refresh has since
 * moved the batch (`TOTAL_CHANGED`), so nobody freezes an amount they never saw (#1320).
 */
@Service()
export class AdminPayoutsService {
  private readonly http = inject(HttpClient);

  /** The period's batches, by venue; empty when none were generated. */
  forPeriod(period: string): Promise<readonly PayoutBatchView[]> {
    return firstValueFrom(
      this.http.get<PayoutBatchView[]>(ADMIN_PAYOUT_BATCHES_API, { params: { period } }),
    );
  }

  /** Generate or refresh the period's `DRAFT` batches from the ledger, answering every batch. */
  generate(period: string): Promise<readonly PayoutBatchView[]> {
    return firstValueFrom(
      this.http.post<PayoutBatchView[]>(ADMIN_PAYOUT_BATCHES_API, null, { params: { period } }),
    );
  }

  /** Freeze a `DRAFT` batch at `reviewedTotalMinor`, the total on screen when the admin chose to. */
  markReported(id: number, reviewedTotalMinor: number): Promise<PayoutBatchView> {
    return firstValueFrom(
      this.http.patch<PayoutBatchView>(`${ADMIN_PAYOUT_BATCHES_API}/${id}`, {
        status: 'REPORTED',
        expectedTotalNetMinor: reviewedTotalMinor,
      }),
    );
  }

  /** Record that a `REPORTED` batch has been paid via BKT. */
  markSettled(id: number): Promise<PayoutBatchView> {
    return firstValueFrom(
      this.http.patch<PayoutBatchView>(`${ADMIN_PAYOUT_BATCHES_API}/${id}`, { status: 'SETTLED' }),
    );
  }
}

/** Narrow a mark failure to a {@link PayoutMarkError}, so the page never handles an `HttpErrorResponse`. */
export function payoutMarkErrorOf(error: unknown): PayoutMarkError {
  if (!(error instanceof HttpErrorResponse)) {
    return 'UNKNOWN';
  }
  const code = problemCodeOf(error);
  return code === 'TOTAL_CHANGED' || code === 'ILLEGAL_TRANSITION' || code === 'NO_SUCH_BATCH'
    ? code
    : 'UNKNOWN';
}
