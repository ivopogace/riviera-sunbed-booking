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
