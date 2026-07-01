package ai.riviera.platform.operator.api;

/**
 * The edge's authentication view of an operator account (invariant #11 — a value record on the
 * published surface). Carries just what a Spring Security {@code UserDetailsService} needs to build a
 * principal: the {@code username}, the stored <strong>opaque credential hash</strong>, and whether
 * the account is {@code active} ({@code ACTIVE}). The hash is treated as an opaque blob by the
 * {@code operator} module — it neither encodes nor verifies it (that is the edge's job, #74 /
 * RV-BE-11); {@code passwordHash} is {@code null} for an account with no login provisioned yet.
 *
 * <p>Deliberately does <em>not</em> expose the {@link OperatorId}: authentication (this view) and
 * ownership resolution ({@link OperatorDirectory#operatorFor}) are separate phases, so the login
 * machinery never needs the technical id.
 */
public record OperatorCredential(String username, String passwordHash, boolean active) {
}
