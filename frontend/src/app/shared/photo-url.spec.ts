import { environment } from '../../environments/environment';

import {
  apiPhotoView,
  CONTAIN_SIZES,
  photoSrcset,
  resolveCoverPhoto,
  slideshowPhotos,
} from './photo-url';
import { PhotoView } from './venue-views';

const CARD: PhotoView = {
  url: '/api/venues/1/photos/aa01',
  sources: [
    { url: '/api/venues/1/photos/aa01', width: 576 },
    { url: '/api/venues/1/photos/bb02', width: 1152 },
  ],
};

const SINGLE: PhotoView = {
  url: '/api/venues/1/photos/cc03',
  sources: [{ url: '/api/venues/1/photos/cc03', width: 576 }],
};

describe('photo-url', () => {
  it('joins every candidate into a w-descriptor srcset', () => {
    expect(photoSrcset(CARD)).toBe(
      '/api/venues/1/photos/aa01 576w, /api/venues/1/photos/bb02 1152w',
    );
  });

  it('states every contain-fitted sizes as vw clauses with a vw fallback, never a pixel length', () => {
    // A px LENGTH throws RuntimeError 2952; the px inside a media condition is fine.
    for (const [surface, value] of Object.entries(CONTAIN_SIZES)) {
      expect(value, surface).toMatch(/^(\(min-width: \d+px\) \d+vw, )*\d+vw$/);
    }
  });

  it('returns null for a single candidate, since src already carries it', () => {
    // A photo stored before the retina tier: the original is gone, so it can never gain one.
    expect(photoSrcset(SINGLE)).toBeNull();
  });

  it('resolves every candidate against the API origin, not just the baseline', () => {
    const resolved = apiPhotoView(CARD);

    expect(resolved.url).toBe(`${environment.apiBaseUrl}/api/venues/1/photos/aa01`);
    expect(resolved.sources.map((source) => source.url)).toEqual([
      `${environment.apiBaseUrl}/api/venues/1/photos/aa01`,
      `${environment.apiBaseUrl}/api/venues/1/photos/bb02`,
    ]);
    expect(resolved.sources.map((source) => source.width)).toEqual([576, 1152]);
  });

  it('resolves the cover pair and passes a missing cover through', () => {
    expect(resolveCoverPhoto({ card: CARD, banner: SINGLE })?.card.url).toBe(
      `${environment.apiBaseUrl}/api/venues/1/photos/aa01`,
    );
    expect(resolveCoverPhoto(null)).toBeNull();
    expect(resolveCoverPhoto(undefined)).toBeNull();
  });

  it('falls back to the chosen cover surface when a payload omits photos', () => {
    expect(
      slideshowPhotos({ photos: [CARD], coverPhoto: { card: SINGLE, banner: SINGLE } }, 'card'),
    ).toEqual([CARD]);
    expect(slideshowPhotos({ coverPhoto: { card: CARD, banner: SINGLE } }, 'banner')).toEqual([
      SINGLE,
    ]);
    expect(slideshowPhotos({}, 'card')).toEqual([]);
  });
});
