package ai.riviera.platform.notification.application;

import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Which of the three facts a booking mail needs did not resolve — the {@code reason} dimension both
 * registry-listener abandon counters are read through
 * ({@link ObservabilityMetrics#MAIL_CONFIRMATION_ABANDONED},
 * {@link ObservabilityMetrics#MAIL_CANCELLATION_ABANDONED} and, since #373,
 * {@link ObservabilityMetrics#MAIL_PAYMENT_DUE_ABANDONED}).
 *
 * <p><strong>One type rather than three string constants per listener</strong> — the {@code MailKind}
 * argument (#442) applied to the dimension those counters do <em>not</em> share. There the two
 * loss counters were raised from two classes and could not name a flow at all; here they are raised
 * from three listeners that each already knew the vocabulary, and the failure a shared type forecloses
 * is the same one: {@code no-set} on one series and {@code no_set} on the other, with the runbook's
 * "start at the module in the table" instruction matching one of them.
 *
 * <p>The three implicate three different modules, which is the whole reason the tag exists — an
 * operator acts on <em>which module to investigate</em>, not on the fact that something was missing.
 * Read any increment as a data-integrity fault rather than a relay one: all three rows are
 * FK-protected and never hard-deleted (erasure tombstones in place), so none is reachable through
 * any application path.
 *
 * <p>Module-internal: no reason ever crosses the module edge.
 */
public enum MissingBookingFact {

	/** {@code booking.api.BookingNotificationFacts} found no booking — investigate {@code booking}. */
	NO_BOOKING("no-booking"),

	/** {@code venue.api.SetBookingFacts} found no set — investigate {@code venue}. */
	NO_SET("no-set"),

	/** {@code customer.api.CustomerLookup} found no contact — investigate {@code customer}. */
	NO_CONTACT("no-contact");

	/** The metric tag key. Shared by all three abandon counters, so a reader can pivot between them. */
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
