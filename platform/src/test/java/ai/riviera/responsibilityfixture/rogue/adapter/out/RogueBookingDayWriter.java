package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of the {@code booking_day} table from outside the {@code booking} module
 * — the violation of §{@code booking}'s sole-writer clause that {@code
 * ResponsibilitiesArchitectureTests}' rule must reject. A service day stamped anywhere else is a
 * second opinion on whether the guest turned up, which the stay outcome is derived from. The SQL
 * text block below puts the table name in this class's constant pool, which is what the bytecode
 * scan keys on.
 */
final class RogueBookingDayWriter {

	static final String STAMP_SQL = """
			UPDATE booking_day SET attended_at = :at WHERE booking_id = :id AND service_date = :serviceDate
			""";

	private RogueBookingDayWriter() {
	}
}
