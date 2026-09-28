package ai.riviera.platform.booking.application.request;

import java.util.List;

/**
 * What {@link RequestClaimService#acceptStay} committed: every stretch {@link Accepted} and holding
 * every day, in day order; a day could not be claimed and the stay declined itself whole
 * ({@link SetUnavailable}); or no pending stay at this venue matched ({@link Missed}).
 */
public sealed interface StayAcceptClaim {

	record Accepted(List<AcceptedRequest> stretches) implements StayAcceptClaim {

		public Accepted {
			stretches = List.copyOf(stretches);
		}
	}

	record SetUnavailable() implements StayAcceptClaim {
	}

	record Missed() implements StayAcceptClaim {
	}
}
