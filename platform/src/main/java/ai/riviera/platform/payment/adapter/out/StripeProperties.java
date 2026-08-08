package ai.riviera.platform.payment.adapter.out;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Stripe credentials + client tuning, bound from configuration — credentials are
 * <strong>never committed</strong> (invariant #8 / AC-9). {@code STRIPE_API_KEY} (the secret key
 * used to create PaymentIntents) and {@code STRIPE_WEBHOOK_SECRET} (the signing secret used to
 * verify inbound webhooks, {@code whsec_...}) come from the environment.
 *
 * <p>Always bound (not profile-gated) so the webhook controller can read the signing secret in
 * tests with a fixture secret; the live {@code StripeClient} bean that uses {@code apiKey} is
 * gated to the {@code stripe} profile in {@link StripeConfig}. Empty strings are the default
 * when unset, which is correct for the default (stub) profile where Stripe is dormant.
 *
 * <p>{@code connectTimeout} / {@code readTimeout} are explicit, short {@code StripeClient}
 * timeouts: the Stripe SDK defaults to 30s connect / 80s read, long enough
 * that a degraded Stripe could pin a request thread (and a pooled connection) — these fail fast
 * instead. Defaults (5s / 20s) comfortably exceed a normal sub-second PaymentIntent create;
 * tune per environment via {@code stripe.connect-timeout} / {@code stripe.read-timeout}.
 *
 * <p><strong>Both timeouts are bounded at bind time, because {@code 0} is the classic
 * footgun.</strong> It reads as "no limit" to whoever types it and means <em>infinite</em> to the JDK
 * HTTP stack the SDK builds on ({@code java.net.URLConnection#setConnectTimeout}: "A timeout of zero is
 * interpreted as an infinite timeout") — so the value that looks like removing a restriction restores
 * precisely the pinned thread and pooled connection these timeouts exist to prevent, on the money path,
 * under the {@code stripe} profile. A negative duration survives {@code Math.toIntExact} in
 * {@link StripeConfig} and is rejected only when a request is actually made, mid-checkout. The ceilings
 * are that argument run backwards: see {@link #MAX_CONNECT_TIMEOUT}.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated} + {@code @Min}: Boot
 * validates {@code @ConfigurationProperties} only when a JSR-303 implementation is on the classpath and
 * there is none (#97 declined {@code spring-boot-starter-validation} in favour of explicit checks in
 * records), so an annotation would bind and validate nothing.
 *
 * @param apiKey         Stripe secret key; env-supplied, never committed (invariant #8)
 * @param webhookSecret  webhook signing secret; env-supplied, never committed (invariant #8)
 * @param connectTimeout default {@code PT5S}, bounded by {@link #MIN_TIMEOUT} / {@link #MAX_CONNECT_TIMEOUT}
 * @param readTimeout    default {@code PT20S}, bounded by {@link #MIN_TIMEOUT} / {@link #MAX_READ_TIMEOUT}
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
	 * The SDK's own default connect timeout — the value this knob exists to <em>shorten</em>. It is the
	 * last accepted value, not the first rejected one: setting exactly the SDK default is merely a no-op,
	 * whereas anything <em>beyond</em> it is worse than leaving the knob unset and hands back the thread
	 * pin these timeouts exist to prevent. 6× the shipped 5s.
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
