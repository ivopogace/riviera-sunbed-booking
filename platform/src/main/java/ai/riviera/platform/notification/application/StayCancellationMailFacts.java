package ai.riviera.platform.notification.application;

/**
 * What {@link BookingMailFactsService#resolveStayCancellation} could, or could not, assemble for a stay's
 * one cancellation mail; sealed so each caller's {@code switch} is exhaustive. Module-internal: public only
 * so {@code adapter/in} can consume it.
 */
public sealed interface StayCancellationMailFacts {

	/** The recipient and the mail, ready to send; {@code mail} carries the stay's code (invariant #7). */
	record Resolved(String toEmail, BookingCancellationMail mail) implements StayCancellationMailFacts {
	}

	/** The first fact that did not resolve. */
	record Missing(MissingBookingFact fact) implements StayCancellationMailFacts {
	}
}
