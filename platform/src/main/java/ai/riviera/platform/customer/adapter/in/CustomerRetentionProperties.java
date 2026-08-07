package ai.riviera.platform.customer.adapter.in;

import java.time.Period;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Externalized configuration for the guest-contact retention sweep, bound from
 * {@code customer.retention.*}.
 *
 * <p>{@code window} is a {@link Period} — <strong>not</strong> a {@code Duration} — because retention
 * periods are expressed in years ({@code P10Y}) and ISO-8601 durations have no year or month unit. The
 * shipped default is deliberately inert: ten years is longer than any plausible statutory period, and
 * the job ships disabled, so nothing is erased until counsel sets a real window and ops opts in.
 *
 * <p>{@code enabled}, {@code sweep-interval} and {@code initial-delay} are deliberately <em>absent</em>
 * from this record: they have no programmatic reader — {@code @ConditionalOnProperty} and the
 * {@code @Scheduled} placeholders consume them directly.
 *
 * <p><strong>Why the window check is {@code isNegative()} — any negative component — rather than a
 * net-duration comparison.</strong> A {@link Period} carries independent years/months/days and no
 * reference date, so a mixed-sign period has no fixed sign: {@code P1M-40D} reports
 * {@code toTotalMonths() == 1}, which reads positive, yet subtracting it moves the cutoff
 * <em>forward</em> — the future-dated cutoff this guard exists to stop, and one any net-duration test
 * would admit. Rejecting every negative component is the only check that cannot be fooled; the cost is
 * that a chronologically-harmless oddity like {@code P2Y-1M} is refused too, which is the right trade
 * when the erasure it guards is irreversible (ADR-0010, pseudonymize-in-place).
 *
 * <p>The guards sit <strong>below</strong> the null-defaulting on purpose: unset config binds both
 * components as {@code null}, so a guard written above the defaults would reject the shipped
 * configuration. There is no ceiling on {@code window} by design — a longer window scrubs <em>less</em>,
 * the safe direction. A compact constructor rather than {@code @Validated} + {@code @Min}: Boot
 * validates {@code @ConfigurationProperties} only with a JSR-303 implementation on the classpath, and
 * there is none by deliberate choice, so an annotation here would validate nothing.
 *
 * @param window    how far back a booking must reach to keep a guest contact; default {@code P10Y},
 *                  must be a positive {@link Period}
 * @param batchSize the most contacts one sweep may scrub; default 500, bounded by {@link #MAX_BATCH_SIZE}
 */
@ConfigurationProperties("customer.retention")
public record CustomerRetentionProperties(Period window, Integer batchSize) {

	private static final Period DEFAULT_WINDOW = Period.ofYears(10);
	private static final int DEFAULT_BATCH_SIZE = 500;

	/**
	 * 20× the shipped 500 — ≈40 000 contacts/day at the shipped cadence, and comfortably under
	 * PostgreSQL's 65 535 bind-parameter ceiling on the candidate {@code IN (:guests)} list. The sweep is
	 * {@code @Transactional} and locks one row per candidate, so the batch <em>is</em> the transaction
	 * bound this record promises; past this it stops being one.
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
