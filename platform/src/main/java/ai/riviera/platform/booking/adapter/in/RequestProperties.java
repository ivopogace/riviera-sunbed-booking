package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Request-to-Book windows, bound from {@code booking.request.*} and validated in the compact
 * constructor (no Bean Validation on the classpath, so {@code @Min} would check nothing).
 *
 * @param expiryWindow venue's time to respond; default {@code PT24H}, at least {@link #MIN_WINDOW},
 *        no ceiling because the deadline is capped at the venue's sales close on D (invariant #4)
 * @param payWindow    guest's time to pay from {@code accepted_at}; default {@code PT12H}, between
 *        {@link #MIN_WINDOW} and {@link #MAX_PAY_WINDOW}, also capped at the end of the service day
 */
@ConfigurationProperties("booking.request")
public record RequestProperties(Duration expiryWindow, Duration payWindow) {

	private static final Duration DEFAULT_EXPIRY_WINDOW = Duration.ofHours(24);
	private static final Duration DEFAULT_PAY_WINDOW = Duration.ofHours(12);

	/**
	 * Floor for both windows: below a minute the deadline passes before any venue could answer or any
	 * guest could pay.
	 */
	static final Duration MIN_WINDOW = Duration.ofMinutes(1);

	/**
	 * Ceiling for the pay window: it alone returns an accepted-but-unpaid set to the pool, so beyond three
	 * days it becomes a hold on a date that could still have been sold.
	 */
	static final Duration MAX_PAY_WINDOW = Duration.ofHours(72);

	public RequestProperties {
		expiryWindow = expiryWindow == null ? DEFAULT_EXPIRY_WINDOW : expiryWindow;
		payWindow = payWindow == null ? DEFAULT_PAY_WINDOW : payWindow;
		if (expiryWindow.compareTo(MIN_WINDOW) < 0) {
			throw new IllegalArgumentException(
					"booking.request.expiry-window must be at least " + MIN_WINDOW + ", but was "
							+ expiryWindow + "; the deadline is min(now + window, the venue's sales close on "
							+ "the booked day), so a window this short makes every pending request expire on "
							+ "creation and no accept can ever win the request_expires_at > now guard — the "
							+ "venue takes no bookings and nothing reports a fault. There is no upper bound: "
							+ "the sales close already caps the deadline (invariant #4)");
		}
		if (payWindow.compareTo(MIN_WINDOW) < 0 || payWindow.compareTo(MAX_PAY_WINDOW) > 0) {
			throw new IllegalArgumentException(
					"booking.request.pay-window must be between " + MIN_WINDOW + " and " + MAX_PAY_WINDOW
							+ ", but was " + payWindow + "; the abandoned sweep expires accepted requests "
							+ "older than now.minus(payWindow), so too short a window cancels the booking and "
							+ "releases its set in the instant the venue accepted it, while too long a one "
							+ "holds that set unpaid past the span in which the date could still be sold");
		}
	}
}
