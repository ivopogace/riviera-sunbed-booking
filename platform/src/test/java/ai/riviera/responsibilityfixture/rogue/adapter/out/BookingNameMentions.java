package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * Strings outside the {@code booking} module that name the bare word {@code booking} without writing
 * the table: a longer table name, a package string, a read, and prose. The table-ownership rule must
 * flag none of them as a write of {@code booking}.
 */
final class BookingNameMentions {

	static final String LONGER_TABLE = "booking_day";

	static final String PACKAGE = "ai.riviera.platform.booking";

	static final String READ_SQL = """
			SELECT id FROM booking WHERE code = :code
			""";

	static final String PROSE = "could not update booking state from booking id";

	private BookingNameMentions() {
	}
}
