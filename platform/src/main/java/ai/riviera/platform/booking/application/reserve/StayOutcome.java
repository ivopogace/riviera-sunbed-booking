package ai.riviera.platform.booking.application.reserve;

import ai.riviera.platform.payment.vocabulary.CheckoutInstruction;

/**
 * The closed set of outcomes of {@link CreateStay#create}: confirmed in-process (stub), awaiting the
 * verified webhook with the group's one checkout instruction (invariant #8), or refused for the same
 * reasons a single booking is.
 */
public sealed interface StayOutcome {

	record Confirmed(StayConfirmation confirmation) implements StayOutcome {
	}

	record AwaitingPayment(StayConfirmation confirmation, CheckoutInstruction instruction) implements StayOutcome {
	}

	/** A stay request at a Request-to-Book venue, pending until {@code requestExpiresAt}; nothing charged or held. */
	record Requested(StayConfirmation confirmation, java.time.Instant requestExpiresAt) implements StayOutcome {
	}

	record Rejected(BookingOutcome.Rejected reason) implements StayOutcome {
	}
}
