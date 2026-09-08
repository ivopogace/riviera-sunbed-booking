package ai.riviera.platform.venue.adapter.in;

import java.util.Arrays;

import ai.riviera.platform.venue.vocabulary.Pool;

/**
 * The one place the wire's pool token becomes the published {@link Pool} — shared by the single-set
 * body, where the token is required, and the batch body, which calls it only for a token it carries
 * (an absent pool there means untouched). An unknown or missing token is {@code 400 INVALID_REQUEST}.
 */
final class PoolToken {

	private PoolToken() {
	}

	/** The typed pool for a required token; {@code null} or an off-vocabulary value is rejected. */
	static Pool parse(String raw) {
		if (raw == null) {
			throw new IllegalArgumentException("pool is required");
		}
		try {
			return Pool.valueOf(raw);
		}
		catch (IllegalArgumentException unknown) {
			throw new IllegalArgumentException("pool must be one of " + Arrays.toString(Pool.values()));
		}
	}
}
