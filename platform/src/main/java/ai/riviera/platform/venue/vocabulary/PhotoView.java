package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * A tourist-surfaced photo as everything the browser needs to pick a rendition: {@code url} is the
 * baseline-density serving URL (the no-{@code srcset} fallback, bound to {@code ngSrc}) and
 * {@code sources} lists every stored candidate with its intrinsic width, ascending.
 *
 * <p>{@code sources} always holds {@code url}'s own candidate; a photo stored before the retina
 * tier has only that one (the original is discarded at upload, ADR-0008). URLs are opaque and
 * content-addressed: a replaced photo changes the URL, never the bytes behind an old one.
 */
public record PhotoView(String url, List<PhotoSourceView> sources) {
}
