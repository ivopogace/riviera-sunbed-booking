package ai.riviera.platform;

import java.time.Instant;
import java.util.List;

/**
 * The platform-admin audit trail (#507, required by ADR-0013): one row per mutating
 * {@code /api/admin/**} action that reached past the security gate — actor, method, path, outcome
 * status, UTC instant, optional sanitized grounds. Written by {@link AdminAuditFilter}, read by
 * {@link AdminAuditController}; append-only, no updates, no deletes (retention is a #507 Phase-1
 * non-goal).
 *
 * <p>Composition-root state, not a module's: the {@code /api/admin} namespace's controllers span
 * five modules and the root, so the accountability record over the whole namespace has no bounded
 * context to live in — the same reasoning that keeps {@code RateLimitFilter} and the session
 * machinery at the edge (RV-BE-11), and the same edge-owned-table precedent as
 * {@code SPRING_SESSION}. An edge-internal seam, not a module surface: implemented by
 * {@link JdbcAdminAuditLog}, stubbed by the web slices.
 */
interface AdminAuditLog {

	/** One recorded admin action, newest-first from {@link #latest}. */
	record Entry(long id, Instant occurredAt, String actor, String method, String path, int status, String reason) {
	}

	void append(String actor, String method, String path, int status, String reason);

	/** The latest {@code limit} actions, newest first (timestamp ties broken by id). */
	List<Entry> latest(int limit);
}
