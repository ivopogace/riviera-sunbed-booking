import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  PhotoUploadView,
  VenuePhotoService,
  photoErrorOf,
  previewUrlOf,
} from './venue-photo.service';

/**
 * The venue-photo client: upload posts ONE multipart `file` part to the slot path (the
 * server replaces the slot, so upload and replace are the same call), remove DELETEs the slot,
 * and the error mapper narrows the RFC-7807 `code` to displayable copy — including the
 * server-side validation rejections the client never second-guesses.
 */
describe('VenuePhotoService (#142)', () => {
  let service: VenuePhotoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VenuePhotoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uploads the picked file as a single multipart "file" part and resolves the variant URLs against the API origin', () => {
    const file = new File(['jpeg-bytes'], 'beach.jpg', { type: 'image/jpeg' });
    let response: PhotoUploadView | undefined;

    service.upload(1, 'cover', file).subscribe((r) => (response = r));

    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/photos/cover'));
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush({
      slot: 'cover',
      variants: [
        { surface: 'card', url: '/api/venues/1/photos/aa01', width: 640, height: 384 },
        { surface: 'preview', url: '/api/venues/1/photos/cc03', width: 480, height: 360 },
      ],
    });
    // The wire paths are root-relative; the service prefixes the API origin so <img> works
    // in local dev where the API is another origin (a no-op in same-origin prod).
    expect(response?.variants.map((v) => v.url)).toEqual([
      'http://localhost:8080/api/venues/1/photos/aa01',
      'http://localhost:8080/api/venues/1/photos/cc03',
    ]);
  });

  it('remove DELETEs the slot path', () => {
    let completed = false;

    service.remove(1, 'sunbeds').subscribe(() => (completed = true));

    const req = http.expectOne(
      (r) => r.method === 'DELETE' && r.url.endsWith('/api/venues/1/photos/sunbeds'),
    );
    req.flush(null);
    expect(completed).toBe(true);
  });

  it('previewUrlOf picks the preview variant, or null when absent', () => {
    expect(
      previewUrlOf({
        slot: 'cover',
        variants: [
          { surface: 'card', url: '/c', width: 640, height: 384 },
          { surface: 'preview', url: '/p', width: 480, height: 360 },
        ],
      }),
    ).toBe('/p');
    expect(previewUrlOf({ slot: 'cover', variants: [] })).toBeNull();
  });

  it('maps the known RFC-7807 codes, 401, and everything else', () => {
    const problem = (status: number, code: string) =>
      new HttpErrorResponse({ status, error: { code } });

    // The server-side validation rejections + the 413 multipart backstop.
    expect(photoErrorOf(problem(400, 'TOO_LARGE'))).toBe('TOO_LARGE');
    expect(photoErrorOf(problem(400, 'UNSUPPORTED_FORMAT'))).toBe('UNSUPPORTED_FORMAT');
    expect(photoErrorOf(problem(400, 'DIMENSIONS_EXCEEDED'))).toBe('DIMENSIONS_EXCEEDED');
    expect(photoErrorOf(problem(400, 'UNREADABLE'))).toBe('UNREADABLE');
    expect(photoErrorOf(problem(413, 'PAYLOAD_TOO_LARGE'))).toBe('PAYLOAD_TOO_LARGE');
    // Authorization + lifecycle.
    expect(photoErrorOf(problem(403, 'NOT_VENUE_OWNER'))).toBe('NOT_VENUE_OWNER');
    expect(photoErrorOf(problem(404, 'NO_SUCH_PHOTO'))).toBe('NO_SUCH_PHOTO');
    expect(photoErrorOf(problem(401, 'UNAUTHENTICATED'))).toBe('UNAUTHORIZED');
    // Anything unrecognized (network failure, proxy error) is UNKNOWN.
    expect(photoErrorOf(problem(500, 'INTERNAL'))).toBe('UNKNOWN');
    expect(photoErrorOf(new Error('offline'))).toBe('UNKNOWN');
  });
});
