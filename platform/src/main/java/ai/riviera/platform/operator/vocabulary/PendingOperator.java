package ai.riviera.platform.operator.vocabulary;

import java.time.Instant;

/**
 * A self-registered operator awaiting admin approval, as the approval surface sees it. Carries
 * exactly what an admin needs to decide: the technical {@link OperatorId} (to approve/reject), the login
 * {@code username}, the {@code contactEmail} it registered with (informational — how to reach the
 * applicant), and when it {@code registeredAt}. A published value record (invariant #11); no credential
 * material crosses the boundary.
 */
public record PendingOperator(OperatorId id, String username, String contactEmail, Instant registeredAt) {
}
