package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.stereotype.Component;

/**
 * Edge helper that mints and digests customer account-recovery tokens (S8, epic #108). Credential-material
 * transformation is an edge concern (RV-BE-11): the raw token is emailed to the user, and only its
 * digest is handed to the {@code customer} module to store.
 *
 * <p>The raw token is 256 bits of {@link SecureRandom} (URL-safe base64, unguessable — invariant #7). The
 * stored form is a <strong>deterministic SHA-256</strong> digest, chosen precisely so the consume path can
 * look a token up by {@code WHERE token_hash = ?} — bcrypt (used for passwords) salts per row and could
 * not be queried, and a high-entropy random token needs no slow hash. Package-private (invariant #11).
 */
@Component
class RecoveryTokens {

	private static final int TOKEN_BYTES = 32; // 256 bits of entropy

	private final SecureRandom random = new SecureRandom();

	/** A fresh, unguessable raw token (URL-safe, no padding). Emailed in the link; never stored or logged. */
	String generate() {
		byte[] bytes = new byte[TOKEN_BYTES];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	/** The deterministic SHA-256 hex digest of a raw token — the opaque value stored + looked up. */
	String hash(String rawToken) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 is required but unavailable on this JRE", e);
		}
	}
}
