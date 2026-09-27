package ai.riviera.platform.notification.application;

/**
 * What {@link BookingMailFactsService#resolveStay} could, or could not, assemble for a stay's one
 * confirmation mail; {@link BookingMailFacts}' twin, sealed so each caller's {@code switch} is
 * exhaustive. Module-internal: public only so {@code adapter/in} can consume it.
 */
public sealed interface StayMailFacts {

	/** The recipient and the mail, ready to send; {@code mail} carries the stay's code (invariant #7). */
	record Resolved(String toEmail, StayConfirmationMail mail) implements StayMailFacts {
	}

	/** The first fact that did not resolve. */
	record Missing(MissingBookingFact fact) implements StayMailFacts {
	}
}
