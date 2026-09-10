package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * A tourist-surfaced photo as everything the browser needs to pick a rendition: {@code url} is the
 * baseline-density serving URL — what a client without {@code srcset} support fetches, and what
 * {@code ngSrc} is bound to — and {@code sources} lists every stored candidate with its intrinsic
 * width, ascending.
 *
 * <p>{@code sources} always contains at least {@code url}'s own candidate. A photo stored before the
 * retina tier existed has exactly one, because the full-res original is discarded at upload
 * (ADR-0008) and cannot be re-rendered; such a photo publishes a one-candidate {@code srcset} rather
 * than nothing. URLs are opaque content-addressed strings — a replaced photo changes the URL, never
 * the bytes behind an old one.
 */
public record PhotoView(String url, List<PhotoSourceView> sources) {
}
