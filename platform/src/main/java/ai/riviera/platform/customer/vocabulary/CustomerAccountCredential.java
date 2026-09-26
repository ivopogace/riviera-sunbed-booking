package ai.riviera.platform.customer.vocabulary;

/**
 * The edge's authentication view of a customer account (#11, a published value record): what a
 * {@code UserDetailsService} needs, the normalized {@code email} and the stored <strong>opaque
 * credential hash</strong>, which the module neither encodes nor verifies (the edge does). Unlike
 * {@code operator.vocabulary.OperatorCredential} it has no {@code active} flag (a customer account
 * has no suspend state) and deliberately omits the {@link CustomerAccountId}, so the login
 * machinery never handles the technical id.
 */
public record CustomerAccountCredential(String email, String passwordHash) {
}
