/**
 * The wire shape of a tourist photo (`PhotoView`): a baseline serving URL plus every stored
 * density candidate. Mock payloads build theirs here so a shape change lands in one place.
 */
export interface MockPhotoView {
  readonly url: string;
  readonly sources: readonly { readonly url: string; readonly width: number }[];
}

/** The baseline candidate's width, matching `PhotoProcessor`'s CARD box for a 3:2 upload. */
const BASELINE_WIDTH = 576;

/**
 * A photo from a bare serving URL. Extra widths become further candidates at `<url>@<width>`,
 * for the specs that read the rendered `srcset`; with none, the photo has a single candidate and
 * renders no `srcset` at all — the pre-retina-tier case.
 */
export function photoView(url: string, ...extraWidths: readonly number[]): MockPhotoView {
  return {
    url,
    sources: [
      { url, width: BASELINE_WIDTH },
      ...extraWidths.map((width) => ({ url: `${url}@${width}`, width })),
    ],
  };
}

/** {@link photoView} over a list of URLs. */
export function photoViews(urls: readonly string[]): readonly MockPhotoView[] {
  return urls.map((url) => photoView(url));
}
