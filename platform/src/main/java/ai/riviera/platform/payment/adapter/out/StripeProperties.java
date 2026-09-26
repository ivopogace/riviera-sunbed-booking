package ai.riviera.platform.payment.adapter.out;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Stripe credentials and client timeouts ({@code stripe.*}). {@code apiKey} ({@code STRIPE_API_KEY}) and
 * {@code webhookSecret} ({@code STRIPE_WEBHOOK_SECRET}) come from the environment, are never committed or
 * logged, and default to empty for the dormant stub profile; always bound so tests can verify webhooks, the
 * live client being {@code stripe}-profile-gated in {@link StripeConfig}. Timeouts default {@code PT5S}
 * connect / {@code PT20S} read and are range-checked at boot — {@code 0} is <em>infinite</em> to the JDK
 * HTTP stack. No {@code @Validated}: no JSR-303 provider is on the classpath.
 */
@ConfigurationProperties("stripe")
public record StripeProperties(String apiKey, String webhookSecret, Duration connectTimeout,
		Duration readTimeout) {

	private static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(5);
	private static final Duration DEFAULT_READ_TIMEOUT = Duration.ofSeconds(20);

	/**
	 * Shared floor for both timeouts. A normal PaymentIntent create is sub-second, so below a second the
	 * timeout fires on the <em>normal</em> call and turns ordinary Stripe latency into failed checkouts —
	 * the mirror image of the zero case, and just as unlikely to be read as a configuration error.
	 */
	static final Duration MIN_TIMEOUT = Duration.ofSeconds(1);

	/**
	 * The SDK's own default connect timeout, which this knob exists to <em>shorten</em>: the last accepted
	 * value, since anything beyond it is worse than leaving the knob unset.
	 */
	static final Duration MAX_CONNECT_TIMEOUT = Duration.ofSeconds(30);

	/** The SDK's own default read timeout, by the same argument. 4× the shipped 20s. */
	static final Duration MAX_READ_TIMEOUT = Duration.ofSeconds(80);

	public StripeProperties {
		apiKey = apiKey == null ? "" : apiKey;
		webhookSecret = webhookSecret == null ? "" : webhookSecret;
		connectTimeout = connectTimeout == null ? DEFAULT_CONNECT_TIMEOUT : connectTimeout;
		readTimeout = readTimeout == null ? DEFAULT_READ_TIMEOUT : readTimeout;
		requireInRange("stripe.connect-timeout", connectTimeout, MAX_CONNECT_TIMEOUT);
		requireInRange("stripe.read-timeout", readTimeout, MAX_READ_TIMEOUT);
	}

	private static void requireInRange(String property, Duration timeout, Duration sdkDefault) {
		if (timeout.compareTo(MIN_TIMEOUT) < 0 || timeout.compareTo(sdkDefault) > 0) {
			throw new IllegalArgumentException(
					property + " must be between " + MIN_TIMEOUT + " and " + sdkDefault + ", but was "
							+ timeout + "; zero is an infinite timeout to the JDK HTTP stack the Stripe SDK "
							+ "builds on, so it restores the pinned request thread these timeouts exist to "
							+ "prevent, a shorter one fires on a normal sub-second PaymentIntent create, and "
							+ "anything beyond the SDK's own default (" + sdkDefault + ", which this knob "
							+ "exists to shorten) is worse than not configuring a timeout at all");
		}
	}
}
