package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of the {@code admin_audit_record} table from outside the {@code audit}
 * module — the violation of §{@code audit}'s "only writer" clause that
 * {@code ResponsibilitiesArchitectureTests}' sole-writer rule must reject. A row appended anywhere
 * else is an unattributable claim about what an admin did, which is the one thing the table exists
 * to settle. The SQL text block below puts the table name in this class's constant pool, which is
 * what the bytecode scan keys on.
 */
final class RogueAdminAuditWriter {

	static final String APPEND_SQL = """
			INSERT INTO admin_audit_record (actor, method, path, status, reason, occurred_at)
			VALUES (:actor, :method, :path, :status, :reason, :occurredAt)
			""";

	private RogueAdminAuditWriter() {
	}
}
