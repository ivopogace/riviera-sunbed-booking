package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of the {@code set_availability} table from outside the
 * {@code availability} module — the exact violation of invariant #2's "only writer" clause
 * that {@code ResponsibilitiesArchitectureTests}' sole-writer rule must reject. The SQL text
 * block below puts the table name in this class's constant pool, which is what the
 * bytecode scan keys on.
 */
final class RogueAvailabilityWriter {

	static final String CLAIM_SQL = """
			INSERT INTO set_availability (set_id, booking_date, state)
			VALUES (:setId, :bookingDate, 'BOOKED_ONLINE')
			ON CONFLICT (set_id, booking_date) DO NOTHING
			""";

	private RogueAvailabilityWriter() {
	}
}
