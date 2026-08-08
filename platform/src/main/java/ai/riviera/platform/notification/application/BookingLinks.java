package ai.riviera.platform.notification.application;

import java.net.URI;

import org.springframework.web.util.UriComponentsBuilder;

/**
 * Builds the link a booking mail points at: the code-gated booking view,
 * {@code <base>/booking/<code>}.
 *
 * <p><strong>Why this module may build a link at all, given RV-BE-11.</strong> That rule keeps
 * <em>credential-material machinery</em> — minting a token, hashing it, deciding its TTL — at the
 * platform edge, and this mints nothing: it formats a booking code the module already reads through
 * {@code booking.api} in order to render it into the mail body. The edge cannot build this one
 * anyway, because the booking mails are raised by registry listeners inside the hexagon rather
 * than by an edge flow with a request in hand.
 *
 * <p><strong>Why {@code /booking/<code>} and not {@code /booking/pay}.</strong> The pay screen
 * resumes from hand-off state the code-gated view puts in memory; entered cold from an inbox it has
 * nothing to resume and is a dead end. The code-gated view is the entry point that works from
 * anywhere — it fetches the booking, and for an {@code AWAITING_PAYMENT} one with an open intent it
 * offers "Pay now" and navigates on. A link that works after the deadline is also better copy than
 * one that 404s: the guest sees the expired booking rather than a broken page.
 *
 * <p>An application-layer value, not a configuration type — the adapter binds the property and hands
 * the origin in (the {@code RequestProperties → RequestWindows} pattern), so the inner hexagon stays
 * framework-light. Validated at construction, so a misconfigured origin fails at boot rather than
 * silently mailing an unusable link from a thread whose caller is long gone.
 */
public record BookingLinks(String baseUrl) {

	/**
	 * The SPA route segment, as a segment rather than a {@code "/booking/"} path literal: the URI is
	 * assembled from parts, which encodes the code and keeps the analyzer's hardcoded-URI rule
	 * (java:S1075) satisfied without pretending the route is a tunable. It is not — it must match
	 * {@code app.routes.ts}, and a deployment free to change it could only break every mailed link.
	 */
	private static final String BOOKING_SEGMENT = "booking";

	public BookingLinks {
		if (baseUrl == null || baseUrl.isBlank()) {
			throw new IllegalArgumentException(
					"riviera.notification.booking-link.base-url must be set — it is the origin every "
							+ "booking mail's link is built on");
		}
		URI parsed = URI.create(baseUrl.strip());
		if (!parsed.isAbsolute() || parsed.getHost() == null) {
			throw new IllegalArgumentException(
					"riviera.notification.booking-link.base-url must be an absolute URL with a host "
							+ "(e.g. https://riviera-sunbed-booking.onrender.com), but was " + baseUrl);
		}
		baseUrl = trimTrailingSlash(baseUrl.strip());
	}

	/** The code-gated view for this booking — where an accepted request's guest goes to pay. */
	public URI forBooking(String bookingCode) {
		return UriComponentsBuilder.fromUriString(baseUrl)
				.pathSegment(BOOKING_SEGMENT, bookingCode)
				.build()
				.toUri();
	}

	private static String trimTrailingSlash(String value) {
		return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
	}
}
