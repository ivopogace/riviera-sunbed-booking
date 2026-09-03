package ai.riviera.platform.audit.adapter.out;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import ai.riviera.platform.audit.api.AdminAuditLog;
import ai.riviera.platform.audit.vocabulary.AdminAuditEntry;

/**
 * {@link AdminAuditLog} on the {@code admin_audit_record} table (V38), and its only writer and
 * reader (ADR-0017). Append-only inserts and the newest-first read the console's Audit tab
 * renders; the ordering is served by {@code admin_audit_record_occurred_idx}.
 */
@Component
class JdbcAdminAuditLog implements AdminAuditLog {

	private final JdbcClient jdbc;
	private final Clock clock;

	JdbcAdminAuditLog(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Override
	public void append(String actor, String method, String path, int status, String reason) {
		jdbc.sql("""
				INSERT INTO admin_audit_record (actor, method, path, status, reason, occurred_at)
				VALUES (:actor, :method, :path, :status, :reason, :occurredAt)
				""")
				.param("actor", actor)
				.param("method", method)
				.param("path", path)
				.param("status", status)
				.param("reason", reason)
				.param("occurredAt", OffsetDateTime.ofInstant(Instant.now(clock), clock.getZone()))
				.update();
	}

	@Override
	public List<AdminAuditEntry> latest(int limit) {
		return jdbc.sql("""
				SELECT id, occurred_at, actor, method, path, status, reason
				FROM admin_audit_record
				ORDER BY occurred_at DESC, id DESC
				LIMIT :limit
				""")
				.param("limit", limit)
				.query((rs, rowNum) -> new AdminAuditEntry(
						rs.getLong("id"),
						rs.getObject("occurred_at", OffsetDateTime.class).toInstant(),
						rs.getString("actor"),
						rs.getString("method"),
						rs.getString("path"),
						rs.getInt("status"),
						rs.getString("reason")))
				.list();
	}
}
