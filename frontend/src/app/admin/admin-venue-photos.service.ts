import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { apiPhotoUrl } from '../shared/photo-url';
import { PhotoSlotKey, VenueSummary } from '../shared/venue-views';
import { AdminPhotoSlotView, AdminVenuePhotosView } from './admin.model';

/** The slot order the surface renders — the backend's `PhotoSlot` declaration order (#142). */
const SLOT_ORDER: readonly PhotoSlotKey[] = ['cover', 'sunbeds', 'bar'];

/** The optional grounds an admin action may carry into the audit trail (#507); sanitized server-side. */
const AUDIT_REASON_HEADER = 'X-Audit-Reason';

/** The wire shape of `GET /api/admin/venues/{venueId}/photos` — a slot-keyed map, like the profile read. */
interface AdminVenuePhotosResponse {
  readonly venueId: number;
  readonly photos: Readonly<Record<PhotoSlotKey, { readonly previewUrl: string | null }>>;
}

/** A venue as the picker needs it — the public catalogue's row, narrowed to what a moderator reads. */
export interface ModerationVenue {
  readonly id: number;
  readonly name: string;
  readonly beach: string;
}

/**
 * HTTP client for the admin console's Photos tab (#511). Stateless: the session cookie + CSRF header
 * are added by {@link apiSessionInterceptor}, and the component holds the page state.
 *
 * <p>The venue list comes from the **public** catalogue (`GET /api/venues`), and stays there now that
 * an admin venue read does exist (A7, #348 — `GET /api/admin/venues`, which the Commissions tab uses).
 * Keeping this picker on the catalogue is a need-to-know call, not inertia: the admin read carries
 * each venue's `commissionBps`, a commercial term a photo moderator has no business reading, and
 * routing moderation through it would put the platform's cut on a content-moderation surface for no
 * gain. The catalogue is also complete — public data, every venue, no publish filter — so nothing is
 * hidden from a moderator by staying on it. It is requested here rather than through the `venue`
 * feature's own service because `admin/` may not import another feature (RV-FE-8) — only the *types*
 * are shared, from `shared/venue-views`.
 *
 * <p>The two moderation calls are ADMIN-gated server-side and deliberately ownership-free: they are
 * the only reads/writes on a venue's photos that answer for a venue the caller does not own.
 */
@Service()
export class AdminVenuePhotosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** Every venue, for the picker. Ordered by the catalogue (rating, then name). */
  venues(): Promise<readonly ModerationVenue[]> {
    return firstValueFrom(
      this.http
        .get<readonly VenueSummary[]>(`${this.base}/api/venues`)
        .pipe(map((venues) => venues.map(({ id, name, beach }) => ({ id, name, beach })))),
    );
  }

  /**
   * One venue's photo slots — always all three, occupied or not. Preview paths are resolved against
   * the API origin here, at the service boundary (#142 review F-7), so the template treats them as
   * opaque strings.
   */
  slots(venueId: number): Promise<AdminVenuePhotosView> {
    return firstValueFrom(
      this.http
        .get<AdminVenuePhotosResponse>(`${this.base}/api/admin/venues/${venueId}/photos`)
        .pipe(map((response) => ({ venueId: response.venueId, slots: slotsOf(response) }))),
    );
  }

  /**
   * Remove one slot's photo — irreversible, and the bytes are gone (#504). `204`; `404` when empty.
   * A non-blank `reason` rides the {@link AUDIT_REASON_HEADER} into the audit trail (#507); header
   * values must be Latin-1, so anything outside it becomes a space rather than an aborted request.
   */
  takedown(venueId: number, slot: PhotoSlotKey, reason?: string): Promise<void> {
    const grounds = reason?.replace(/[^\x20-\x7e\xa0-\xff]/g, ' ').trim();
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/api/admin/venues/${venueId}/photos/${slot}`, {
        headers: grounds ? { [AUDIT_REASON_HEADER]: grounds } : {},
      }),
    );
  }
}

/** The slot-keyed map as an ordered list, so the template renders a stable grid without sorting. */
function slotsOf(response: AdminVenuePhotosResponse): readonly AdminPhotoSlotView[] {
  return SLOT_ORDER.map((slot) => {
    const previewUrl = response.photos?.[slot]?.previewUrl ?? null;
    return { slot, previewUrl: previewUrl === null ? null : apiPhotoUrl(previewUrl) };
  });
}
