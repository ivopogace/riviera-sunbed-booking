package ai.riviera.platform.operator.vocabulary;

/**
 * The edge's authentication view of an operator account (invariant #11): what a Spring Security
 * {@code UserDetailsService} needs: {@code username}, the <strong>opaque credential hash</strong>
 * ({@code null} until a login is provisioned; the module never encodes or verifies it, RV-BE-11),
 * and {@code status}, from which the edge derives its may-authenticate set. No {@link OperatorId}:
 * login never needs it (ownership is {@code OperatorDirectory#operatorFor}'s phase). {@code admin}
 * is the platform-admin flag the edge maps to {@code ROLE_ADMIN}, gating {@code /api/admin/**}.
 */
public record OperatorCredential(String username, String passwordHash, OperatorStatus status, boolean admin) {
}
