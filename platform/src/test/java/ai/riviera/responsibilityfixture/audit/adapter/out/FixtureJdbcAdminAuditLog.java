package ai.riviera.responsibilityfixture.audit.adapter.out;

/**
 * The {@code audit} module's own trail adapter, in fixture form: the sole-writer rule must NOT flag
 * it. Without this the negative proof would pass for the wrong reason — a rule that rejected every
 * reference, the module's included, would look green against the rogue writer alone.
 */
final class FixtureJdbcAdminAuditLog {

	static final String LATEST_SQL = """
			SELECT id, occurred_at, actor, method, path, status, reason
			FROM admin_audit_record
			ORDER BY occurred_at DESC, id DESC
			LIMIT :limit
			""";

	private FixtureJdbcAdminAuditLog() {
	}
}
