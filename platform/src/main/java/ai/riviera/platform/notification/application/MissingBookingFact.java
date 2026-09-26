package ai.riviera.platform.notification.application;

import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Which of a booking mail's three facts did not resolve: the {@code reason} tag shared by every
 * registry-listener abandon counter (e.g. {@link ObservabilityMetrics#MAIL_CONFIRMATION_ABANDONED}),
 * one enum so no series drifts in spelling. The listener then returns normally, so the publication
 * completes and nothing retries the mail. Each value names the module to investigate; an increment
 * is a data-integrity fault, not a relay one (the rows are FK-protected, never hard-deleted).
 * Runbook: {@code docs/runbooks/observability.md}.
 */
public enum MissingBookingFact {

	/** {@code booking.api.BookingNotificationFacts} found no booking — investigate {@code booking}. */
	NO_BOOKING("no-booking"),

	/** {@code venue.api.SetBookingFacts} found no set — investigate {@code venue}. */
	NO_SET("no-set"),

	/** {@code customer.api.CustomerLookup} found no contact — investigate {@code customer}. */
	NO_CONTACT("no-contact");

	/** The metric tag key. Shared by all the abandon counters, so a reader can pivot between them. */
	public static final String TAG = "reason";

	private final String tagValue;

	MissingBookingFact(String tagValue) {
		this.tagValue = tagValue;
	}

	/**
	 * This reason's tag value, as shipped. The observability runbook tells an on-call reader to
	 * filter on these by name, so they are a public vocabulary: changing one breaks a dashboard
	 * rather than renaming a constant.
	 */
	public String tagValue() {
		return tagValue;
	}
}
