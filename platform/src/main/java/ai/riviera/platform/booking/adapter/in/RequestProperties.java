package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The Request-to-Book windows (issue #98), bound from {@code booking.request.*}:
 * {@code expiry-window} — how long a venue has to respond to a pending request (default 24h;
 * the effective deadline is additionally capped at the venue's sales close on D, invariant #4) —
 * and {@code pay-window} — how long the guest has to pay after accept, from {@code accepted_at}
 * (default 12h; the guest may be asleep when the accept lands, so the instant-book 15-minute
 * TTL would be far too tight). Converted to the application-layer {@code RequestWindows} value
 * by {@code BookingRequestConfig}, so the application holds no configuration type.
 *
 * <p>The expiry sweep's cadence ({@code booking.request.sweep-interval},
 * {@code booking.request.initial-delay}) is consumed only by the {@code @Scheduled} placeholders
 * on {@code RequestSweepScheduler} — deliberately not in this record (no programmatic reader),
 * same as the abandoned sweep's cadence keys.
 *
 * <p><strong>Both windows are validated (#426), and both degenerate values present as "nothing
 * happens".</strong> {@code expiry-window=PT0S} makes {@code min(now + window, cutoff)} equal
 * {@code now}, so every pending request is born expired and no accept can win the
 * {@code request_expires_at > now} guard: a Request-mode venue takes no bookings at all and its queue
 * simply always reads empty. {@code pay-window=PT0S} fails one step later — it is the accepted-request
 * arm of the abandoned sweep ({@code now.minus(payWindow)}), so the booking is cancelled and its
 * {@code (set, date)} claim released in the same instant the venue accepted it, while the guest is
 * being asked to pay for it.
 *
 * <p><strong>{@code expiryWindow} is bounded below only, deliberately.</strong> {@code ReserveSetService}
 * caps the deadline at the venue's sales close on D — {@code min(clock.instant().plus(expiryWindow),
 * cutoff.salesCloseAt(...))}, invariant #4 — so an over-long window cannot reach the domain:
 * it degrades to "expires at the sales close", the safe direction. A ceiling would bound a
 * value the use site already bounds. {@code payWindow} is capped the same way at the end of the
 * service day ({@code RequestWindows#payDeadline}) and is <em>also</em> bounded at both ends
 * ({@link #MAX_PAY_WINDOW}), because the cap only binds for a near-term accept —
 * one accepted days ahead still holds its set for the whole raw window.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated} + {@code @Min}: Boot
 * validates {@code @ConfigurationProperties} only when a JSR-303 implementation is on the classpath and
 * there is none (#97 declined {@code spring-boot-starter-validation} in favour of explicit checks in
 * records), so an annotation would bind and validate nothing.
 *
 * @param expiryWindow how long a venue has to respond; default {@code PT24H}, at least
 *        {@link #MIN_WINDOW}, uncapped above because the cutoff caps it
 * @param payWindow    how long the guest has to pay after accept; default {@code PT12H}, bounded by
 *        {@link #MIN_WINDOW} and {@link #MAX_PAY_WINDOW}
 */
@ConfigurationProperties("booking.request")
public record RequestProperties(Duration expiryWindow, Duration payWindow) {

	private static final Duration DEFAULT_EXPIRY_WINDOW = Duration.ofHours(24);
	private static final Duration DEFAULT_PAY_WINDOW = Duration.ofHours(12);

	/**
	 * Shared floor for both windows, and above zero on purpose: a sub-minute window is the same defect
	 * as {@code PT0S} met a little less often — no venue answers a request inside a minute, and no guest
	 * completes a card payment inside one, so either way the deadline passes before the party it exists
	 * for could act.
	 */
	static final Duration MIN_WINDOW = Duration.ofMinutes(1);

	/**
	 * 6× the shipped 12 hours, and far past the reason the default is 12 hours at all (the guest may be
	 * asleep when the accept lands). The pay window is the only thing that returns an accepted-but-unpaid
	 * set to the pool, so beyond three days it stops being a window and becomes a hold: the set sits
	 * claimed across the whole span in which that date could still have been sold.
	 */
	static final Duration MAX_PAY_WINDOW = Duration.ofHours(72);

	public RequestProperties {
		expiryWindow = expiryWindow == null ? DEFAULT_EXPIRY_WINDOW : expiryWindow;
		payWindow = payWindow == null ? DEFAULT_PAY_WINDOW : payWindow;
		if (expiryWindow.compareTo(MIN_WINDOW) < 0) {
			throw new IllegalArgumentException(
					"booking.request.expiry-window must be at least " + MIN_WINDOW + ", but was "
							+ expiryWindow + "; the deadline is min(now + window, the booked day's opening), "
							+ "so a window this short makes every pending request expire on creation and no "
							+ "accept can ever win the request_expires_at > now guard — the venue takes no "
							+ "bookings and nothing reports a fault. There is no upper bound: the cutoff "
							+ "already caps the deadline (invariant #4)");
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
