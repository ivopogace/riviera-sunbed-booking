/**
 * The <strong>admin audit trail</strong> (ADR-0013, ADR-0017) — not a bounded context but a
 * Cohesive Mechanism (Evans, DDD ch. 15): a separate lightweight framework behind an
 * intention-revealing interface. It appends one row per mutating {@code /api/admin/**} action that
 * reached past the security gate — actor, method, path, outcome status, UTC instant, optional
 * grounds — and serves the newest-first read the admin console's Audit tab renders. Append-only:
 * no updates, no deletes.
 *
 * <p><strong>Closed and dependency-free:</strong> {@code allowedDependencies = {}} — not even the
 * {@code shared} kernel. The audited namespace's controllers are spread across bounded contexts
 * and the root, so no one context can own the record over the whole namespace; a mechanism that
 * knew a domain type would be a bounded context wearing this module's clothes. The whole surface a caller sees is
 * {@link ai.riviera.platform.audit.api.AdminAuditLog}, and the composition root reaches only that.
 *
 * <p><strong>The fence is not here.</strong> Which requests are audited, the filter and its
 * ordering, the {@code X-Audit-Reason} header and its sanitizer, and the ADMIN role gate are the
 * platform edge's — see {@code RESPONSIBILITIES.md} § <em>Platform edge</em> and § {@code audit}.
 * Thin template (ADR-0007): no application service, because the JDBC adapter implements the
 * published port directly; it owns table-backed state, not an aggregate.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Admin audit trail",
	allowedDependencies = {}
)
package ai.riviera.platform.audit;
