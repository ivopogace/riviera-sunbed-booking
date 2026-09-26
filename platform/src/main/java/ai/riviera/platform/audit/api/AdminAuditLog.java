package ai.riviera.platform.audit.api;

import java.util.List;

import ai.riviera.platform.audit.vocabulary.AdminAuditEntry;

/**
 * The platform-admin audit trail (ADR-0013): one row per mutating {@code /api/admin/**} action
 * that reached past the security gate — actor, method, path, outcome status, UTC instant, optional
 * sanitized grounds. Append-only, no updates, no deletes; rows are kept indefinitely.
 *
 * <p>The edge's fence appends here; the module's own read serves the console's Audit tab.
 * {@code reason} is stored as given — the caller neutralizes client-supplied text first
 * ({@code RESPONSIBILITIES.md} § <em>Platform edge</em>).
 */
public interface AdminAuditLog {

	void append(String actor, String method, String path, int status, String reason);

	/** The latest {@code limit} actions, newest first (timestamp ties broken by id). */
	List<AdminAuditEntry> latest(int limit);
}
