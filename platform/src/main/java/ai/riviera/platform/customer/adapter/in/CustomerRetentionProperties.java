package ai.riviera.platform.customer.adapter.in;

import java.time.Period;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Retention sweep config ({@code customer.retention.*}), checked at boot below the null-defaulting.
 * {@code window}: a {@link Period} (a Duration has no years), default {@code P10Y}, no ceiling (longer scrubs
 * less), and no zero or negative component — a mixed-sign {@code P1M-40D} moves the cutoff forward, and
 * erasure is irreversible (ADR-0010). {@code batchSize}: default 500, 1 to {@link #MAX_BATCH_SIZE}. No
 * {@code @Validated}: no JSR-303 provider is on the classpath. Ranges: docs/runbooks/data-erasure.md.
 */
@ConfigurationProperties("customer.retention")
public record CustomerRetentionProperties(Period window, Integer batchSize) {

	private static final Period DEFAULT_WINDOW = Period.ofYears(10);
	private static final int DEFAULT_BATCH_SIZE = 500;

	/**
	 * The sweep is one {@code @Transactional} batch locking a row per candidate, so this is its transaction
	 * bound; also well under PostgreSQL's 65 535 bind parameters on {@code IN (:guests)}.
	 */
	static final int MAX_BATCH_SIZE = 10_000;

	public CustomerRetentionProperties {
		window = window == null ? DEFAULT_WINDOW : window;
		batchSize = batchSize == null ? DEFAULT_BATCH_SIZE : batchSize;
		if (window.isZero() || window.isNegative()) {
			throw new IllegalArgumentException(
					"customer.retention.window must be a positive Period with no negative component, but "
							+ "was " + window + "; a zero window puts the cutoff at today, and any negative "
							+ "component can put it in the future — P1M-40D reads positive by total months "
							+ "yet moves the cutoff forward — so the first sweep would scrub every guest "
							+ "contact with no booking on or after that date, irreversibly (ADR-0010), and "
							+ "no later config fix undoes it");
		}
		if (batchSize <= 0 || batchSize > MAX_BATCH_SIZE) {
			throw new IllegalArgumentException(
					"customer.retention.batch-size must be between 1 and " + MAX_BATCH_SIZE + ", but was "
							+ batchSize + "; a non-positive size reaches LIMIT 0, so the sweep finds no "
							+ "candidates and returns without logging anything, scrubbing nothing for as long "
							+ "as it stays set, while an oversized one is the unbounded transaction this "
							+ "bound exists to prevent");
		}
	}
}
