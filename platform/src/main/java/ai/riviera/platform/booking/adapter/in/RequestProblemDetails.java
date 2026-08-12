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
	 * withdraw. It names neither a request nor a route out of pending, because the withdraw leg
	 * reaches it for <em>any</em> booking that is not {@code PENDING_REQUEST} — including an
	 * Instant-mode booking that was never a request and never awaited a venue at all.
	 */
	static final String NOT_PENDING = "This booking is not awaiting a venue response.";

	private RequestProblemDetails() {
	}
}
