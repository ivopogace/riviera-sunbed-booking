package ai.riviera.platform.notification.application;

import java.time.LocalDate;

/**
 * What {@link BookingMailFactsService#resolveStayRequest} could, or could not, assemble for a stay
 * request's one mail (#1267): the recipient, the stay's code (a bearer credential, invariant #7), the
 * venue and the stay's whole span. Module-internal: public only so {@code adapter/in} can consume it.
 */
public sealed interface StayRequestMailFacts {

	record Resolved(String toEmail, String stayCode, String venueName, LocalDate firstDate, LocalDate lastDate)
			implements StayRequestMailFacts {
	}

	/** The first fact that did not resolve. */
	record Missing(MissingBookingFact fact) implements StayRequestMailFacts {
	}
}
