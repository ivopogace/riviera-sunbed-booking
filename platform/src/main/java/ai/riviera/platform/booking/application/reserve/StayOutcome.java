package ai.riviera.platform.booking.application.reserve;

/**
 * The closed set of outcomes of {@link CreateStay#create}: confirmed in-process (stub), awaiting the
 * verified webhook with the group's one {@code clientSecret} (invariant #8), or refused for the same
 * reasons a single booking is.
 */
public sealed interface StayOutcome {

	record Confirmed(StayConfirmation confirmation) implements StayOutcome {
	}

	record AwaitingPayment(StayConfirmation confirmation, String clientSecret, String paymentIntentId)
			implements StayOutcome {
	}

	record Rejected(BookingOutcome.Rejected reason) implements StayOutcome {
	}
}
