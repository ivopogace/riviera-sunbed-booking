package ai.riviera.platform.booking.application.request;

/**
 * What {@link RequestClaimService#accept} committed: the request is {@link Accepted} and holds every
 * day of its span; a day could not be claimed and the request declined itself
 * ({@link SetUnavailable}); or no pending row at this venue matched ({@link Missed}), which the caller
 * classifies through the snapshot.
 */
public sealed interface AcceptClaim {

	record Accepted(AcceptedRequest request) implements AcceptClaim {
	}

	record SetUnavailable() implements AcceptClaim {
	}

	record Missed() implements AcceptClaim {
	}
}
