package ai.riviera.platform.venue.vocabulary;

/**
 * The content hash of a stored photo variant — lower-case hex over the variant's bytes: the cache
 * key in the content-addressed serving URL and its {@code ETag} (ADR-0008), so a replaced photo
 * gets a new URL and a hash always names the same bytes. Revalidated, not {@code immutable}: a
 * removed variant stops being served.
 *
 * <p>Hex-only is also the serving-path safety guard: a public {@code GET …/photos/{hash}} hash
 * cannot carry a path-traversal / SSRF payload, as anything but {@code [0-9a-f]} is rejected.
 */
public record ContentHash(String value) {

	public ContentHash {
		if (value == null || !value.matches("[0-9a-f]+")) {
			throw new IllegalArgumentException("content hash must be non-empty lower-case hex");
		}
	}
}
