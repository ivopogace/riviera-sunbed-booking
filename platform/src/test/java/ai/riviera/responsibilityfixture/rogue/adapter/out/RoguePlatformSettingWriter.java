package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of the {@code platform_setting} table from outside the {@code payout}
 * module — the violation of §{@code payout}'s "sole writer" clause that
 * {@code ResponsibilitiesArchitectureTests}' sole-writer rule must reject. The value it holds is
 * what the ledger deducts, so a second writer is a second opinion on what a venue is charged. The
 * SQL text block below puts the table name in this class's constant pool, which is what the
 * bytecode scan keys on.
 */
final class RoguePlatformSettingWriter {

	static final String WRITE_SQL = """
			UPDATE platform_setting SET amount_minor = :amount WHERE setting_key = :key
			""";

	private RoguePlatformSettingWriter() {
	}
}
