import { PhotoView } from '../app/shared/venue-views';

/** The baseline candidate's intrinsic width, matching `PhotoProcessor`'s CARD box for a 3:2 upload. */
const BASELINE_WIDTH = 576;

/**
 * A {@link PhotoView} from a bare serving URL, for the many specs that only care about which photo
 * renders. Its `url` is the URL given, so an assertion comparing a rendered `src` to the fixture
 * string keeps reading naturally.
 *
 * Extra widths become further candidates at `<url>@<width>`, for the specs that do care about the
 * `srcset`. With none, the view has a single source and renders no `srcset` at all.
 */
export function photoView(url: string, ...extraWidths: readonly number[]): PhotoView {
  return {
    url,
    sources: [
      { url, width: BASELINE_WIDTH },
      ...extraWidths.map((width) => ({ url: `${url}@${width}`, width })),
    ],
  };
}

/** {@link photoView} over a list of URLs. */
export function photoViews(urls: readonly string[]): readonly PhotoView[] {
  return urls.map((url) => photoView(url));
}

/** `PhotoProcessor` fits a LIGHTBOX within 2200x1800, at scale 1 only. */
const LIGHTBOX_BOX = { width: 2200, height: 1800 };

/**
 * A photo as the lightbox's own candidate list carries it: ONE candidate at the stored width, since
 * the surface has a single scale. The box is near-square, so the binding axis flips with the
 * aspect — a 3:2 upload stores 2200w and a 2:3 one 1200w.
 */
export function lightboxPhotoView(url: string, aspect = 3 / 2): PhotoView {
  const width = Math.round(Math.min(LIGHTBOX_BOX.width, LIGHTBOX_BOX.height * aspect));
  return { url: `${url}@${width}`, sources: [{ url: `${url}@${width}`, width }] };
}
