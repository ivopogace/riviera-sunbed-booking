package ai.riviera.platform;

/**
 * How a registry IT finds its own {@code event_publication(_archive)} row in a database every IT class
 * writes to: by the booking id the event names, read through a JSON path beside the pinned
 * {@code event_type}. A {@code LIKE} on a digit fragment also matches another test's amount, date,
 * venue or set id (#1462); a bare {@code {"value":n}} also matches a {@code venueId} or {@code setId}.
 */
public final class RegistryRows {

	/** {@link #namesBooking} for the events that carry {@code bookingId}. */
	public static final String NAMES_BOOKING = namesBooking("bookingId");

	private RegistryRows() {
	}

	/**
	 * SQL predicate: the event's {@code field} holds booking {@code :bookingId} (bind {@link #bookingIdParam}).
	 * Guarded by {@code pg_input_is_valid}: some ITs plant non-JSON payloads, and a bare cast on one fails.
	 */
	public static String namesBooking(String field) {
		return """
				CASE WHEN pg_input_is_valid(serialized_event, 'jsonb')
				     THEN serialized_event::jsonb -> '%s' ->> 'value' END = :bookingId""".formatted(field);
	}

	/** The {@code :bookingId} value: the JSON path yields text. */
	public static String bookingIdParam(long bookingId) {
		return String.valueOf(bookingId);
	}
}
