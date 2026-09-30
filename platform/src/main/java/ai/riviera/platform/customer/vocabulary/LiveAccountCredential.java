package ai.riviera.platform.customer.vocabulary;

/**
 * A live (unerased) customer account's id, normalized {@code email} and stored <strong>opaque credential
 * hash</strong> (#11), which the module neither encodes nor verifies. {@code passwordHash} is {@code null} for an
 * SSO-only account. Unlike {@link CustomerAccountCredential} it carries the id, so a reader can tell an account
 * from a later one under the same email.
 */
public record LiveAccountCredential(CustomerAccountId accountId, String email, String passwordHash) {
}
