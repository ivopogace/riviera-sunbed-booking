package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit spec for {@link RecoveryTokens} (S8 #113): the raw token is unguessable + URL-safe, and the stored
 * form is a <strong>deterministic</strong> SHA-256 hex digest (so the consume path can look it up by
 * hash — invariant #7 / R-2). Determinism is asserted against the published SHA-256 of {@code "abc"}.
 */
class RecoveryTokensTest {

	/** RFC-6234 SHA-256("abc"). */
	private static final String SHA256_OF_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

	private final RecoveryTokens tokens = new RecoveryTokens();

	@Test
	void hashIsDeterministicStableAndCollisionSensitive() {
		assertThat(tokens.hash("abc")).isEqualTo(SHA256_OF_ABC);
		assertThat(tokens.hash("abc")).as("deterministic — same input, same digest").isEqualTo(tokens.hash("abc"));
		assertThat(tokens.hash("abc")).as("a different token yields a different digest").isNotEqualTo(tokens.hash("abd"));
	}

	@Test
	void generateProducesDistinctUrlSafeHighEntropyTokens() {
		String a = tokens.generate();
		String b = tokens.generate();

		assertThat(a).isNotEqualTo(b);
		assertThat(a).isNotEmpty().matches("[A-Za-z0-9_-]+"); // URL-safe base64, no padding
		assertThat(tokens.hash(a)).hasSize(64); // 256-bit digest as hex
	}
}
