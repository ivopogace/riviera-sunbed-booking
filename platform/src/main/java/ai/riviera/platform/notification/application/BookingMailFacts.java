package ai.riviera.platform.notification.application;

/**
 * What {@link BookingMailFactsService} could — or could not — assemble about one booking: a typed
 * outcome, never an {@code Optional}, because every caller must <em>name</em> the missing fact to
 * tag its loss counter and point an operator at the module that owes the row.
 *
 * <p>Sealed, so each listener's {@code switch} is exhaustive without a {@code default}.
 * Module-internal: public only so {@code adapter/in} can consume it.
 */
public sealed interface BookingMailFacts {

	/**
	 * Everything a booking mail renders about the booking, its spot and its recipient, gathered from
	 * three modules' published ports.
	 *
	 * <p>{@code bookingCode} is the tourist's arrival credential (invariant #7) — mailed, never
	 * logged. Not every consumer uses every field (the cancellation mail renders no spot): the
	 * spot arrives on the same {@code venue} read as {@code venueName}, so narrowing per consumer
	 * would cost a second port call.
	 */
	record Resolved(String toEmail, String bookingCode, String venueName, String rowLabel,
			int positionNo) implements BookingMailFacts {
	}

	/** The first fact that did not resolve — the reads short-circuit, so exactly one is named. */
	record Missing(MissingBookingFact fact) implements BookingMailFacts {
	}
}
