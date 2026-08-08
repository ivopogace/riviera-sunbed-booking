package ai.riviera.platform.booking.application.request;

import java.time.Duration;
import java.time.Instant;

/**
 * The two Request-to-Book time windows, as a plain application-layer value — the
 * adapter binds them from configuration ({@code booking.request.*}, see
 * {@code RequestProperties}/{@code BookingRequestConfig}) so this layer holds no configuration
 * type, mirroring how the abandoned sweep receives its TTL.
 *
 * <ul>
 * <li>{@code expiryWindow} — how long a venue has to accept/decline before the request expires;
 *     the effective deadline is additionally capped at the evening-before cutoff (invariant #4).</li>
 * <li>{@code payWindow} — how long the guest has to pay after accept, measured from
 *     {@code accepted_at} (never {@code created_at} — the instant-book TTL clock would sweep an
 *     accepted request immediately).</li>
 * </ul>
 */
public record RequestWindows(Duration expiryWindow, Duration payWindow) {

	/**
	 * When an accepted request's guest must have paid — the deadline #373 mails them.
	 *
	 * <p>It is stated here, beside {@link #acceptedBefore}, because the mail promises a moment the
	 * abandoned sweep enforces, and the two must be the same one. Before #373 the enforcing half was a
	 * {@code now.minus(payWindow)} expression inside {@code AbandonedBookingSweepService}, so a mailed
	 * deadline could only have been checked against it by eye. As exact inverses off one field they
	 * cannot drift; {@code RequestWindowsTest} pins the boundary from both sides.
	 */
	public Instant payDeadline(Instant acceptedAt) {
		return acceptedAt.plus(payWindow);
	}

	/**
	 * The cutoff the abandoned sweep's accepted arm binds: a booking whose {@code accepted_at} is
	 * strictly before this has run out its pay window. Strictly — so at {@link #payDeadline} itself
	 * the booking is not yet expirable, and the mail never promises a moment already past.
	 */
	public Instant acceptedBefore(Instant now) {
		return now.minus(payWindow);
	}
}
