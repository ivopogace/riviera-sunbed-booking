package ai.riviera.platform.booking.adapter.in;

/**
 * Wire {@code detail} strings shared by more than one driving adapter in this package, so one
 * error {@code code} answers in one wording wherever it is raised.
 *
 * <p>A per-controller copy of the same sentence is the drift this exists to prevent: nothing keeps
 * two literals in step, and a divergence is invisible until someone diffs two responses.
 */
final class RequestProblemDetails {

	/**
	 * {@code REQUEST_NOT_PENDING}, raised by the venue's accept and decline and by the guest's
	 * withdraw. Names no request and no route out of pending: withdraw reaches it for
	 * <em>any</em> non-{@code PENDING_REQUEST} booking, even an Instant one that awaited no venue.
	 */
	static final String NOT_PENDING = "This booking is not awaiting a venue response.";

	private RequestProblemDetails() {
	}
}
