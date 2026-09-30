package ai.riviera.platform.customer.vocabulary;

/**
 * The normalized {@code email} and stored <strong>opaque password hash</strong> of an account that has a local
 * password (#11); the module neither encodes nor verifies the hash. What the edge's self-service password change
 * verifies against; login and the session check read the id-bearing {@link LiveAccountCredential}.
 */
public record CustomerAccountCredential(String email, String passwordHash) {
}
