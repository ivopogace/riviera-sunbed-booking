/**
 * <strong>Platform observability</strong> (ADR-0028 Decision 5): a closed non-context module. Stamps each
 * request with a correlation id and carries it onto pooled workers, names the platform's operational
 * metrics, registers the outbox-backlog gauge and runs the money-path alert self-check. Emission and tags
 * stay with the module owning the thing measured. {@code allowedDependencies = {}}; callers see only
 * {@code vocabulary}. Rationale: {@code RESPONSIBILITIES.md} §{@code monitoring}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Monitoring",
	allowedDependencies = {}
)
package ai.riviera.platform.monitoring;
