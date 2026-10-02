package ai.riviera.retirefixture.rogue.adapter.out;

/**
 * A bare read under the exempt constant's name in a class that does not implement
 * {@code SetBookingFacts}: the name buys nothing there, so it must be rejected.
 */
final class RogueBorrowedNameReader {

	static final String SET_BOOKING_INFO_SELECT = """
			SELECT id, row_label, position_no
			FROM set_position
			WHERE id = :id
			""";

	private RogueBorrowedNameReader() {
	}
}
