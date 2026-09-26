package ai.riviera.platform.booking.application.request;

import java.time.Duration;
import java.time.Instant;

/**
 * The two Request-to-Book windows, bound from {@code booking.request.*}. {@code expiryWindow}: how
 * long the venue has to answer, capped at its sales close (invariant #4). {@code payWindow}: how long
 * the guest has to pay, from {@code accepted_at} — never {@code created_at}, which would sweep an
 * accepted request at once — capped at the end of the service day. Instants are UTC; day boundaries
 * come from {@code BookingCutoff} in {@code Europe/Tirane} (invariant #6).
 */
public record RequestWindows(Duration expiryWindow, Duration payWindow) {

	/**
	 * The deadline the payment-due mail promises: {@code min(acceptedAt + payWindow, serviceDayEndsAt)}.
	 * It must stay the moment the abandoned sweep enforces (its SQL mirrors this; {@code RequestWindowsTest}
	 * pins both); the sales-close cap on accepting keeps it from ever being already past.
	 */
	public Instant payDeadline(Instant acceptedAt, Instant serviceDayEndsAt) {
		Instant windowEnds = acceptedAt.plus(payWindow);
		return windowEnds.isBefore(serviceDayEndsAt) ? windowEnds : serviceDayEndsAt;
	}

	/**
	 * The abandoned sweep's accepted-arm cutoff: an {@code accepted_at} strictly before it has outrun the
	 * raw pay window — strictly, so the uncapped {@link #payDeadline} instant itself is still payable.
	 */
	public Instant acceptedBefore(Instant now) {
		return now.minus(payWindow);
	}

	/**
	 * Whether an {@code AWAITING_PAYMENT} booking is past paying: its service day has ended (inclusive at
	 * {@code serviceDayEndsAt}) or a non-null {@code acceptedAt} (null for instant book) is before
	 * {@link #acceptedBefore}. The sweep's instant-book TTL closes no window here.
	 */
	public boolean payWindowClosed(Instant acceptedAt, Instant serviceDayEndsAt, Instant now) {
		return !now.isBefore(serviceDayEndsAt)
				|| (acceptedAt != null && acceptedAt.isBefore(acceptedBefore(now)));
	}
}
