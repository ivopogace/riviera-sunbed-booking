package ai.riviera.platform.venue.vocabulary;

/**
 * The content hash of a stored photo variant — lower-case hex over the variant's bytes. It is the
 * cache key in the content-addressed serving URL and the {@code ETag} that revalidates it
 * (ADR-0008), so a replaced photo gets a new hash → a new URL, and a given hash always
 * names the same bytes. The URL is content-addressed, <em>not</em> {@code Cache-Control: immutable}:
 * a removed variant stops being served rather than staying valid for a year.
 *
 * <p>The hex-only invariant is also the serving-path safety guard: a hash arriving on the public
 * {@code GET …/photos/{hash}} route can never carry a path-traversal / SSRF payload (no slashes,
 * dots, or scheme), because anything but {@code [0-9a-f]} is rejected here at the edge.
 */
public record ContentHash(String value) {

	public ContentHash {
		if (value == null || !value.matches("[0-9a-f]+")) {
			throw new IllegalArgumentException("content hash must be non-empty lower-case hex");
		}
	}
}
