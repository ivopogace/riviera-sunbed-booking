package ai.riviera.platform.customer.vocabulary;

/**
 * The edge's authentication view of a customer account (#11): the normalized {@code email} and the stored
 * <strong>opaque credential hash</strong>, which the module neither encodes nor verifies (the edge does);
 * {@code null} only from {@code CustomerAccounts#sessionCredential}, for an SSO-only account. No
 * {@code active} flag (a customer has no suspend state) and no {@link CustomerAccountId}, so the login
 * machinery never handles the technical id.
 */
public record CustomerAccountCredential(String email, String passwordHash) {
}
