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
 * @param window    how far back a booking must reach to keep a guest contact; default {@code P10Y}
 * @param batchSize the most contacts one sweep may scrub; default 500
 */
@ConfigurationProperties("customer.retention")
public record CustomerRetentionProperties(Period window, Integer batchSize) {

	private static final Period DEFAULT_WINDOW = Period.ofYears(10);
	private static final int DEFAULT_BATCH_SIZE = 500;

	public CustomerRetentionProperties {
		window = window == null ? DEFAULT_WINDOW : window;
		batchSize = batchSize == null ? DEFAULT_BATCH_SIZE : batchSize;
	}
}
