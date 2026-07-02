package ai.riviera.platform.venue.vocabulary;

/**
 * How a venue sells its sets online (spec §3, chosen per venue): {@link #INSTANT} auto-confirms
 * against the live map (pay now → verified webhook confirms); {@link #REQUEST} turns an online
 * booking into a request the venue must accept before payment is requested (issue #98,
 * payment-request-on-accept). Mirrors the {@code venue.booking_mode} CHECK tokens (V2) one-to-one.
 * Published vocabulary — the {@code booking} module branches the reserve flow on it via
 * {@link SetBookingInfo#bookingMode()} (invariant #11: id/value-based seam, no table reach).
 */
public enum BookingMode {
	INSTANT,
	REQUEST
}
