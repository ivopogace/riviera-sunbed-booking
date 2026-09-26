package ai.riviera.platform.challenge.application;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Proof-of-work tunables, {@code riviera.altcha.*}. Rationale: RESPONSIBILITIES.md §Platform edge, §challenge.
 * @param enabled    kill switch: off, fenced routes admit unsolved requests and the endpoint 204s
 * @param cost       PBKDF2 iterations per attempt, bounded by {@link #MIN_COST}..{@link #MAX_COST}
 * @param expiry     how long a challenge stays solvable and acceptable after it is issued
 * @param clockSkew  how long a used registry row outlives its expiry, against lagging-clock replay
 * @param hmacSecret signing secret ({@code RIVIERA_ALTCHA_HMAC_SECRET}); blank: random per-boot key
 */
@ConfigurationProperties("riviera.altcha")
public record AltchaProperties(
		@DefaultValue("true") boolean enabled,
		@DefaultValue("5000") int cost,
		@DefaultValue("PT10M") Duration expiry,
		@DefaultValue("PT30S") Duration clockSkew,
		@DefaultValue("") String hmacSecret) {

	/** Below one iteration the fence costs nothing. */
	public static final int MIN_COST = 1;
	/** Twenty times the shipped default: past it the widget's own 90-second timeout fails honest phones. */
	public static final int MAX_COST = 100_000;
	/** Under a minute a slow phone cannot solve before the challenge expires. */
	public static final Duration MIN_EXPIRY = Duration.ofMinutes(1);
	/** ALTCHA's own guidance caps a challenge's life at an hour. */
	public static final Duration MAX_EXPIRY = Duration.ofHours(1);
	/** A registry row need not outlive its challenge by more than a few minutes of instance skew. */
	public static final Duration MAX_CLOCK_SKEW = Duration.ofMinutes(5);

	/**
	 * Validated here, not annotated: Boot validates {@code @ConfigurationProperties} only with a
	 * JSR-303 implementation on the classpath, and there is none by deliberate choice.
	 */
	public AltchaProperties {
		if (cost < MIN_COST || cost > MAX_COST) {
			throw new IllegalArgumentException("riviera.altcha.cost must be between " + MIN_COST + " and "
					+ MAX_COST + ", but was " + cost + " — below the floor the fence costs nothing, above the "
					+ "ceiling the widget's own timeout fails honest phones");
		}
		if (expiry == null || expiry.compareTo(MIN_EXPIRY) < 0 || expiry.compareTo(MAX_EXPIRY) > 0) {
			throw new IllegalArgumentException("riviera.altcha.expiry must be between " + MIN_EXPIRY + " and "
					+ MAX_EXPIRY + ", but was " + expiry);
		}
		if (clockSkew == null || clockSkew.isNegative() || clockSkew.compareTo(MAX_CLOCK_SKEW) > 0) {
			throw new IllegalArgumentException("riviera.altcha.clock-skew must be between PT0S and "
					+ MAX_CLOCK_SKEW + ", but was " + clockSkew);
		}
		if (hmacSecret == null) {
			hmacSecret = "";
		}
	}
}
