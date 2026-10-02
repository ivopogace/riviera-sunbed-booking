package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of the bare-named {@code booking} table from outside the {@code booking}
 * module, one statement per write shape, each of which {@code ResponsibilitiesArchitectureTests}'
 * table-ownership rule must reject.
 */
final class RogueBookingWriter {

	static final String CANCEL_SQL = """
			UPDATE booking b SET status = 'CANCELLED' WHERE b.id = :id
			""";

	static final String INSERT_SQL = """
			INSERT INTO booking (code) VALUES (:code) ON CONFLICT DO NOTHING
			""";

	static final String DELETE_SQL = """
			DELETE FROM public.booking WHERE id = :id
			""";

	static final String MERGE_SQL = """
			MERGE INTO "booking" b USING staged s ON b.id = s.id WHEN MATCHED THEN DELETE
			""";

	static final String TRUNCATE_SQL = """
			TRUNCATE TABLE booking
			""";

	private RogueBookingWriter() {
	}
}
