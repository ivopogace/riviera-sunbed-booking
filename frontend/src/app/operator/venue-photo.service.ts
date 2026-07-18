import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';
import { apiPhotoUrl } from '../venue/photo-url';
import { PhotoSlotKey } from './operator-console.model';

/** One stored variant of an uploaded photo (#142): its surface, serving URL, and dimensions. */
export interface PhotoVariantView {
  readonly surface: 'card' | 'banner' | 'preview';
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/** The upload response (#142): the slot plus each stored variant's content-addressed serving URL. */
export interface PhotoUploadView {
  readonly slot: PhotoSlotKey;
  readonly variants: readonly PhotoVariantView[];
}

/**
 * The venue-photo client (#142) — upload/replace (one multipart POST per slot; a re-upload
 * replaces server-side) and delete, both venue-scoped and owner-asserted server-side (invariant
 * #13); the session cookie + CSRF ride the `apiSessionInterceptor`. HTTP only — the per-slot UI
 * state lives in the Venue tab. Serving URLs in the responses are opaque content-addressed
 * strings fed straight to `<img>`/`NgOptimizedImage`.
 */
@Service()
export class VenuePhotoService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /**
   * Upload (or replace) the slot's photo. POST `multipart/form-data`, one `file` part; the server
   * validates the real bytes (magic sniff, ≤25 MB, dimension guard), strips EXIF, resizes, and
   * answers with the stored variants' URLs so the tab can preview without a re-fetch.
   */
  upload(venueId: number, slot: PhotoSlotKey, file: File): Observable<PhotoUploadView> {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .post<PhotoUploadView>(`${this.base}/api/venues/${venueId}/photos/${slot}`, body)
      .pipe(
        // Variant paths resolve against the API origin (#142 review F-7; no-op same-origin prod).
        map((uploaded) => ({
          ...uploaded,
          variants: uploaded.variants.map((v) => ({ ...v, url: apiPhotoUrl(v.url) })),
        })),
      );
  }

  /** Delete the slot's photo (metadata + bytes, one transaction server-side). `204`; `404` when empty. */
  remove(venueId: number, slot: PhotoSlotKey): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/venues/${venueId}/photos/${slot}`);
  }
}

/** The PREVIEW variant's serving URL out of an upload response, or `null` if absent. */
export function previewUrlOf(upload: PhotoUploadView): string | null {
  return upload.variants.find((variant) => variant.surface === 'preview')?.url ?? null;
}

/**
 * A known photo upload/delete failure (#142), mapped from the RFC-7807 `code` (#97) for
 * operator-facing copy. The four validation rejections come from the server-side processor
 * (the client never trusts its own pre-checks); `PAYLOAD_TOO_LARGE` is the multipart 413
 * backstop; `NO_SUCH_PHOTO` is a delete on an already-empty slot.
 */
export type PhotoErrorCode =
  | 'TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'DIMENSIONS_EXCEEDED'
  | 'UNREADABLE'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_VENUE_OWNER'
  | 'NO_SUCH_PHOTO'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

/** Map a photo upload/delete failure to a known {@link PhotoErrorCode} (RFC-7807 `code`; or 401). */
export function photoErrorOf(error: unknown): PhotoErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'TOO_LARGE':
      case 'UNSUPPORTED_FORMAT':
      case 'DIMENSIONS_EXCEEDED':
      case 'UNREADABLE':
      case 'PAYLOAD_TOO_LARGE':
      case 'NOT_VENUE_OWNER':
      case 'NO_SUCH_PHOTO':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}
