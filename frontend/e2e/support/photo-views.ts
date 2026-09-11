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

/** `PhotoProcessor` fits a BANNER within 1280×480, and its retina tier within 2560×960. */
const BANNER_BOX = { width: 1280, height: 480 };

/**
 * A venue-page photo carrying both stored BANNER candidates, for the specs that assert which one
 * the browser fetched. {@link photoView}'s baseline is the CARD box, which would offer a choice the
 * real payload never does.
 *
 * The candidate widths follow the upload's aspect, which is the whole reason this takes one: a 3:2
 * upload stores 720w/1440w and a 16:9 one 853w/1707w, so a spec that only ever saw 3:2 cannot see a
 * `sizes` that serves 3:2 and under-serves wider. Each tier is fitted into its own box, as
 * `PhotoProcessor` does — the retina width is not the baseline doubled, and past 8:3 both are
 * width-bound and stop following the aspect at all.
 */
export function bannerPhotoView(url: string, aspect = 3 / 2): MockPhotoView {
  const fit = (scale: number) =>
    Math.round(Math.min(BANNER_BOX.width * scale, BANNER_BOX.height * scale * aspect));
  const baseline = fit(1);
  const retina = fit(2);
  return {
    url,
    sources: [
      { url, width: baseline },
      { url: `${url}@${retina}`, width: retina },
    ],
  };
}
