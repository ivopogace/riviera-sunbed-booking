package ai.riviera.platform.customer.vocabulary;

/**
 * The edge's authentication view of a customer account (invariant #11 — a value record on the
 * published surface). Carries just what a Spring Security {@code UserDetailsService} needs to build a
 * principal: the normalized {@code email} and the stored <strong>opaque credential hash</strong>. The
 * hash is treated as an opaque blob by the {@code customer} module — it neither encodes nor verifies
 * it (that is the edge's job, RV-BE-11). Mirrors {@code operator.vocabulary.OperatorCredential} but
 * with no {@code active} flag: a customer account has no suspend state in S2 (S8 adds
 * email-verification state).
 *
 * <p>Deliberately does <em>not</em> expose the {@link CustomerAccountId}: authentication (this view)
 * needs only the email + hash, so the login machinery never handles the technical id.
 */
public record CustomerAccountCredential(String email, String passwordHash) {
}
