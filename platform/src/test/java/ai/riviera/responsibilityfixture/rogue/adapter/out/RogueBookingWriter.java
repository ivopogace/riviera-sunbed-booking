package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of the bare-named {@code booking} table from outside the {@code booking}
 * module: the violation of the "Sole writer of" column that {@code ResponsibilitiesArchitectureTests}'
 * table-ownership rule must reject.
 */
final class RogueBookingWriter {

	static final String CANCEL_SQL = """
			UPDATE booking b SET status = 'CANCELLED' WHERE b.id = :id
			""";

	private RogueBookingWriter() {
	}
}
