package ai.riviera.platform.venue.vocabulary;

/**
 * One density candidate of a venue photo: its content-addressed serving URL and the intrinsic pixel
 * width of the bytes behind it. The pair is everything an HTML {@code srcset} entry needs
 * ({@code "<url> <width>w"}); the client composes the attribute, so the wire stays structured data
 * rather than a presentation string.
 */
public record PhotoSourceView(String url, int width) {
}
