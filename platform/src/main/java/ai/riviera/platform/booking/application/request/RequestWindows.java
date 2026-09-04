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
 *     accepted request immediately), and capped at the end of the service day (invariant #4).</li>
 * </ul>
 */
public record RequestWindows(Duration expiryWindow, Duration payWindow) {

	/**
	 * When an accepted request's guest must have paid — the deadline the payment-due mail promises:
	 * {@code min(acceptedAt + payWindow, serviceDayEndsAt)}. The window is never past the end of the
	 * service day (invariant #4, spec §13): once the day is over there is nothing left to buy,
	 * however much of the raw window remains. The accept deadline itself is capped at the venue's
	 * sales close, which sits before the day's end — so no accept can produce a pay deadline already
	 * in the past.
	 *
	 * <p>It is stated here, beside {@link #acceptedBefore}, because the mail promises a moment the
	 * abandoned sweep enforces and the two must be the same one. For the raw window the two are exact
	 * inverses off one field and cannot drift; the cap is the second bound, which the sweep binds as
	 * its own {@code booking_date} predicate rather than through {@link #acceptedBefore}.
	 * {@code RequestWindowsTest} pins both.
	 */
	public Instant payDeadline(Instant acceptedAt, Instant serviceDayEndsAt) {
		Instant windowEnds = acceptedAt.plus(payWindow);
		return windowEnds.isBefore(serviceDayEndsAt) ? windowEnds : serviceDayEndsAt;
	}

	/**
	 * The cutoff the abandoned sweep's accepted arm binds — and {@link #payWindowClosed} applies for
	 * the code-gated view: a booking whose {@code accepted_at} is strictly before this has run out
	 * its <em>raw</em> pay window. Strictly — so at the uncapped {@link #payDeadline} itself the
	 * booking is not yet expirable, and the mail never promises a moment already past. The other arm
	 * both share expires a booking whose service day has ended, inclusive at the day-end instant.
	 */
	public Instant acceptedBefore(Instant now) {
		return now.minus(payWindow);
	}

	/**
	 * Whether an {@code AWAITING_PAYMENT} booking can no longer be paid at {@code now}: its service
	 * day has ended — inclusive at {@code serviceDayEndsAt} — or an accepted request has outrun its
	 * raw pay window, strictly, so the instant {@link #payDeadline} promises is still payable. The
	 * two arms are the ones the abandoned sweep binds in SQL
	 * ({@code Bookings#findExpirableAwaitingPayment}); its third, the instant-book TTL, is the
	 * sweep's alone and closes no window here — an instant booking stays payable until the sweep
	 * cancels its intent.
	 *
	 * @param acceptedAt when the venue accepted the request, {@code null} for an instant booking
	 */
	public boolean payWindowClosed(Instant acceptedAt, Instant serviceDayEndsAt, Instant now) {
		return !now.isBefore(serviceDayEndsAt)
				|| (acceptedAt != null && acceptedAt.isBefore(acceptedBefore(now)));
	}
}
