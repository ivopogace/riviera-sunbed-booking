package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of the {@code stay} table from outside the {@code booking} module — the
 * violation of §{@code booking}'s sole-writer clause that {@code ResponsibilitiesArchitectureTests}'
 * rule must reject. The SQL text block puts the keyword + table name in this class's constant pool,
 * which is what the bytecode scan keys on.
 */
final class RogueStayWriter {

	static final String RECODE_SQL = """
			UPDATE stay SET code = :code WHERE id = :id
			""";

	private RogueStayWriter() {
	}
}
