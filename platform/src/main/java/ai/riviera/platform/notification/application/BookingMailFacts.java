package ai.riviera.platform.notification.application;

/**
 * What {@link BookingMailFactsService} could — or could not — assemble about one booking: a
 * typed outcome rather than an {@code Optional}, because "absent" is not the useful answer here.
 * Every caller has to <em>name</em> the missing fact, both to tag its loss counter and to point an
 * operator at the module that owes the row, so collapsing the three cases into an empty
 * {@code Optional} would throw away the only part of the failure anyone acts on.
 *
 * <p>Sealed, so each listener's {@code switch} is exhaustive without a {@code default} — a third
 * outcome could not be added without every caller being made to handle it.
 *
 * <p>Module-internal: public only so {@code adapter/in} can consume it, like
 * {@code BookingConfirmationMail} beside it. Nothing outside {@code notification} sees it.
 */
public sealed interface BookingMailFacts {

	/**
	 * Everything a booking mail renders about the booking, its spot and its recipient, gathered from
	 * three modules' published ports.
	 *
	 * <p>{@code bookingCode} is the tourist's arrival credential (invariant #7) — mailed, never
	 * logged. Not every consumer uses every field: the cancellation mail renders no spot, because a
	 * released set is not a fact its reader needs. That is deliberate and costs nothing — the spot
	 * arrives on the same single {@code venue} read that supplies {@code venueName}, so narrowing the
	 * record per consumer would buy a second port call rather than save a query.
	 */
	record Resolved(String toEmail, String bookingCode, String venueName, String rowLabel,
			int positionNo) implements BookingMailFacts {
	}

	/** The first fact that did not resolve — the reads short-circuit, so exactly one is named. */
	record Missing(MissingBookingFact fact) implements BookingMailFacts {
	}
}
