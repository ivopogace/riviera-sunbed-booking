import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { apiPhotoUrl } from '../shared/photo-url';
import { PhotoSlotKey, VenueSummary } from '../shared/venue-views';
import { AdminPhotoSlotView, AdminVenuePhotosView } from './admin.model';

/** The slot order the surface renders — the backend's `PhotoSlot` declaration order (#142). */
const SLOT_ORDER: readonly PhotoSlotKey[] = ['cover', 'sunbeds', 'bar'];

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
 * <p>The venue list comes from the **public** catalogue (`GET /api/venues`) rather than an admin
 * venue endpoint, which does not exist and which this slice deliberately does not add: the catalogue
 * is public data, lists every venue with no publish filter, and so costs no new backend surface. It
 * is requested here rather than through the `venue` feature's own service because `admin/` may not
 * import another feature (RV-FE-8) — only the *types* are shared, from `shared/venue-views`.
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

  /** Remove one slot's photo — irreversible, and the bytes are gone (#504). `204`; `404` when empty. */
  takedown(venueId: number, slot: PhotoSlotKey): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/api/admin/venues/${venueId}/photos/${slot}`),
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
