/**
 * The <strong>admin audit trail</strong> (ADR-0013, ADR-0017): a Cohesive Mechanism, not a bounded
 * context. Appends one row per mutating {@code /api/admin/**} action that passed the security gate and
 * serves the Audit tab's newest-first read. Append-only: no updates, no deletes.
 *
 * <p><strong>Closed, {@code allowedDependencies = {}}, not even {@code shared}:</strong> callers reach
 * only {@link ai.riviera.platform.audit.api.AdminAuditLog}; the fence (which requests, the reason
 * header, the ADMIN gate) is the edge's. Rationale: {@code RESPONSIBILITIES.md} §{@code audit}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Admin audit trail",
	allowedDependencies = {}
)
package ai.riviera.platform.audit;
