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
 *     the effective deadline is additionally capped at the venue's sales close (invariant #4).</li>
 * <li>{@code payWindow} — how long the guest has to pay after accept, measured from
 *     {@code accepted_at} (never {@code created_at} — the instant-book TTL clock would sweep an
 *     accepted request immediately), and capped at the service day's opening (invariant #4).</li>
 * </ul>
 */
public record RequestWindows(Duration expiryWindow, Duration payWindow) {

	/**
	 * When an accepted request's guest must have paid — the deadline the payment-due mail promises:
	 * {@code min(acceptedAt + payWindow, serviceDayOpensAt)}. Past the service day's opening a
	 * payment would buy a stay already underway, so the window closes there however much of it is
	 * left (invariant #4), the same day-open boundary the accept deadline is capped at (by the
	 * venue's sales close, which sits on or before it).
	 *
	 * <p>It is stated here, beside {@link #acceptedBefore}, because the mail promises a moment the
	 * abandoned sweep enforces and the two must be the same one. For the raw window the two are exact
	 * inverses off one field and cannot drift; the cap is the second bound, which the sweep binds as
	 * its own {@code booking_date} predicate rather than through {@link #acceptedBefore}.
	 * {@code RequestWindowsTest} pins both.
	 */
	public Instant payDeadline(Instant acceptedAt, Instant serviceDayOpensAt) {
		Instant windowEnds = acceptedAt.plus(payWindow);
		return windowEnds.isBefore(serviceDayOpensAt) ? windowEnds : serviceDayOpensAt;
	}

	/**
	 * The cutoff the abandoned sweep's accepted arm binds: a booking whose {@code accepted_at} is
	 * strictly before this has run out its <em>raw</em> pay window. Strictly — so at the uncapped
	 * {@link #payDeadline} itself the booking is not yet expirable, and the mail never promises a
	 * moment already past. The sweep's other arm expires a booking whose service day has opened.
	 */
	public Instant acceptedBefore(Instant now) {
		return now.minus(payWindow);
	}
}
