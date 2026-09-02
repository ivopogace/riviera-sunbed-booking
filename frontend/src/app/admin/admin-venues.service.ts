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
 * cookie + CSRF header are added by {@link apiSessionInterceptor}.
 *
 * <p>The list comes from the **admin** venue read (`GET /api/admin/venues`, the Commissions tab's
 * endpoint), not the public catalogue: the catalogue hides every venue whose owning operator is not
 * `ACTIVE` — exactly the venues a moderator must still reach. The admin read is platform-wide and
 * unfiltered. It carries each venue's `commissionBps`, but the same `ADMIN` role already reads that
 * figure on the Commissions tab, so nothing new is exposed — the pickers simply ignore the field. The
 * response is narrowed here rather than through another feature's service (RV-FE-8).
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
