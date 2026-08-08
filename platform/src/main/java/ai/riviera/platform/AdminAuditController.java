package ai.riviera.platform;

import java.time.Instant;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The platform-admin read over the audit trail: the latest recorded admin actions, newest
 * first — the surface the admin console's Audit tab renders. Role-gated to {@code ADMIN} in
 * {@link SecurityConfig} (the invariant-#13 {@code /api/admin/**} exemption, like its siblings);
 * itself a {@code GET}, so browsing the trail never writes to it.
 *
 * <p>No paging, search or filters at Phase 1 — a recent-actions view ({@code limit} defaulting to
 * {@value #DEFAULT_LIMIT}, clamped to {@value #MAX_LIMIT}); an investigation needing more queries
 * the table directly.
 */
@RestController
@RequestMapping("/api/admin")
class AdminAuditController {

	private static final int DEFAULT_LIMIT = 50;
	private static final int MAX_LIMIT = 200;

	private final AdminAuditLog auditLog;

	AdminAuditController(AdminAuditLog auditLog) {
		this.auditLog = auditLog;
	}

	/** Wire view of one recorded action; {@code occurredAt} serializes as an ISO-8601 UTC instant. */
	record AuditEntryView(long id, Instant occurredAt, String actor, String method, String path, int status,
			String reason) {
	}

	@GetMapping("/audit")
	List<AuditEntryView> audit(@RequestParam(name = "limit", required = false) Integer limit) {
		int capped = limit == null ? DEFAULT_LIMIT : Math.clamp(limit, 1, MAX_LIMIT);
		return auditLog.latest(capped).stream()
				.map(entry -> new AuditEntryView(entry.id(), entry.occurredAt(), entry.actor(), entry.method(),
						entry.path(), entry.status(), entry.reason()))
				.toList();
	}
}
