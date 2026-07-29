package ai.riviera.platform.customer.adapter.in;

import java.time.Period;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Externalized configuration for the guest-contact retention sweep (Slice 2 of #101), bound from
 * {@code customer.retention.*}.
 *
 * <p>{@code window} is a {@link Period} — <strong>not</strong> a {@code Duration} — because retention
 * periods are expressed in years ({@code P10Y}) and ISO-8601 durations have no year or month unit. The
 * shipped default is deliberately inert: ten years is longer than any plausible statutory period, and the
 * job is disabled anyway, so nothing is erased until counsel sets a real window and ops opts in.
 *
 * <p>{@code enabled}, {@code sweep-interval} and {@code initial-delay} are deliberately <em>absent</em> from
 * this record: they have no programmatic reader — {@code @ConditionalOnProperty} and the {@code @Scheduled}
 * placeholders consume them directly — matching {@code AbandonedPaymentProperties}' documented rule.
 *
 * <p><strong>Both knobs are validated here (#414), and both degenerate values boot cleanly.</strong> A
 * {@code batch-size} of {@code 0} reaches {@code LIMIT 0}: the sweep runs forever, logs its normal
 * "swept 0" outcome, and scrubs nothing — and since retention ships disabled, that surfaces only after
 * ops enables it in production, i.e. exactly when the obligation it implements has started counting. A
 * {@code window} of {@code P0D} fails the opposite way: it puts the cutoff at <em>today</em>, so the
 * first sweep scrubs every guest contact with no booking on or after today, and a negative period puts
 * the cutoff in the future and scrubs more still. That erasure is irreversible (ADR-0010,
 * pseudonymize-in-place) — no later config fix undoes it — which makes the window the highest-
 * consequence knob in this record and the one worth failing the boot over.
 *
 * <p>The guards sit <strong>below</strong> the null-defaulting on purpose: unset config binds both
 * components as {@code null}, so a guard written above the defaults would reject the shipped
 * configuration. There is no ceiling on {@code window} by design — a longer window scrubs
 * <em>less</em>, which is the documented safe direction.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated} + {@code @Min} because
 * Boot validates {@code @ConfigurationProperties} only when a JSR-303 implementation is on the
 * classpath, and there is none: #97 declined {@code spring-boot-starter-validation} deliberately, in
 * favour of explicit checks in records ({@code riviera-java-conventions} §2/§6b). An annotation here
 * would bind and validate nothing — the same silent degradation, reached from the other side. Prior
 * art: {@code RegistryMailProperties} (#408).
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
	 * 20× the shipped 500 — ≈40 000 contacts/day at the shipped {@code PT6H} cadence, and comfortably
	 * under PostgreSQL's 65 535 bind-parameter ceiling on the candidate {@code IN (:guests)} list.
	 * {@code ExpireGuestContactsService#sweep} is {@code @Transactional} and locks one row per candidate,
	 * so the batch <em>is</em> the transaction bound this record promises; past this it stops being one.
	 */
	static final int MAX_BATCH_SIZE = 10_000;

	public CustomerRetentionProperties {
		window = window == null ? DEFAULT_WINDOW : window;
		batchSize = batchSize == null ? DEFAULT_BATCH_SIZE : batchSize;
		if (window.isZero() || window.isNegative()) {
			throw new IllegalArgumentException(
					"customer.retention.window must be a positive Period, but was " + window
							+ "; a zero window puts the cutoff at today and a negative one puts it in the "
							+ "future, so the first sweep scrubs every guest contact with no booking on or "
							+ "after that date — irreversibly (ADR-0010), and no later config fix undoes it");
		}
		if (batchSize <= 0 || batchSize > MAX_BATCH_SIZE) {
			throw new IllegalArgumentException(
					"customer.retention.batch-size must be between 1 and " + MAX_BATCH_SIZE + ", but was "
							+ batchSize + "; a non-positive size reaches LIMIT 0, so the sweep runs forever, "
							+ "logs its normal outcome and scrubs nothing, while an oversized one is the "
							+ "unbounded transaction this bound exists to prevent");
		}
	}
}
