package ai.riviera.platform.notification.application;

/**
 * What {@link BookingMailFactsService#resolveMoveReminder} could, or could not, assemble for a move's one
 * reminder; sealed so each caller's {@code switch} is exhaustive. Module-internal: public only so
 * {@code adapter/in} can consume it.
 */
public sealed interface MoveReminderMailFacts {

	/** The recipient and the mail, ready to send; {@code mail} carries the stay's code (invariant #7). */
	record Resolved(String toEmail, MoveReminderMail mail) implements MoveReminderMailFacts {
	}

	/** The first fact that did not resolve. */
	record Missing(MissingBookingFact fact) implements MoveReminderMailFacts {
	}
}
