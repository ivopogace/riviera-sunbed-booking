package ai.riviera.platform.audit.vocabulary;

import java.time.Instant;

/**
 * One recorded admin action, as {@link ai.riviera.platform.audit.api.AdminAuditLog#latest} answers
 * it: newest first. {@code reason} is {@code null} when no grounds were offered.
 */
public record AdminAuditEntry(long id, Instant occurredAt, String actor, String method, String path,
		int status, String reason) {
}
