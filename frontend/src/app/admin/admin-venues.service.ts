import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { environment } from '../../environments/environment';

/** `GET /api/admin/venues`, narrowed to the pickers' fields — the response's other fields are ignored. */
interface AdminVenuesResponse {
  readonly venues: readonly {
    readonly venueId: number;
    readonly name: string;
    readonly beach: string;
  }[];
}

/** A venue as a moderation picker needs it — the admin venue list's row, narrowed to what a moderator reads. */
export interface ModerationVenue {
  readonly id: number;
  readonly name: string;
  readonly beach: string;
}

/**
 * The venue picker behind the console's moderation tabs (Photos, Reviews). Stateless: the session
 * cookie + CSRF header are added by `apiSessionInterceptor`.
 *
 * <p>Reads the **admin** venue list (`GET /api/admin/venues`), never the public catalogue, which
 * hides every venue whose operator is not `ACTIVE` — exactly those a moderator must reach. Its
 * `commissionBps` is already ADMIN-readable on the Commissions tab, so nothing new is exposed.
 * Narrowed here, not through another feature's service (RV-FE-8).
 */
@Service()
export class AdminVenuesService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** Every venue — hidden ones included — in the admin list's order. */
  venues(): Promise<readonly ModerationVenue[]> {
    return firstValueFrom(
      this.http
        .get<AdminVenuesResponse>(`${this.base}/api/admin/venues`)
        .pipe(
          map(({ venues }) =>
            venues.map(({ venueId, name, beach }) => ({ id: venueId, name, beach })),
          ),
        ),
    );
  }
}
