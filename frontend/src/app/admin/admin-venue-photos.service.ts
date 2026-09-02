import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { apiPhotoUrl } from '../shared/photo-url';
import { PhotoSlotKey } from '../shared/venue-views';
import { AdminPhotoSlotView, AdminVenuePhotosView } from './admin.model';

/** The slot order the surface renders — the backend's `PhotoSlot` declaration order. */
const SLOT_ORDER: readonly PhotoSlotKey[] = ['cover', 'sunbeds', 'bar'];

/** The optional grounds an admin action may carry into the audit trail; sanitized server-side. */
const AUDIT_REASON_HEADER = 'X-Audit-Reason';

/** The wire shape of `GET /api/admin/venues/{venueId}/photos` — a slot-keyed map, like the profile read. */
interface AdminVenuePhotosResponse {
  readonly venueId: number;
  readonly photos: Readonly<Record<PhotoSlotKey, { readonly previewUrl: string | null }>>;
}

/**
 * HTTP client for the admin console's Photos tab. Stateless: the session cookie + CSRF header
 * are added by {@link apiSessionInterceptor}, and the component holds the page state.
 *
 * <p>The venue picker's list is {@link AdminVenuesService}'s, shared with the Reviews tab.
 *
 * <p>The two moderation calls are ADMIN-gated server-side and deliberately ownership-free: they are
 * the only reads/writes on a venue's photos that answer for a venue the caller does not own.
 */
@Service()
export class AdminVenuePhotosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /**
   * One venue's photo slots — always all three, occupied or not. Preview paths are resolved against
   * the API origin here, at the service boundary, so the template treats them as
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
   * Remove one slot's photo — irreversible, and the bytes are gone. `204`; `404` when empty.
   * A non-blank `reason` rides the {@link AUDIT_REASON_HEADER} into the audit trail; header
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
