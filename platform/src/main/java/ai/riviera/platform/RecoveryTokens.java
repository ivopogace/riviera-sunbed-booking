package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.stereotype.Component;

/**
 * Edge helper that mints and digests customer account-recovery tokens; credential material is an
 * edge concern (RV-BE-11): the raw token is emailed, only its digest goes to {@code customer}.
 *
 * <p>The raw token is 256 bits of {@link SecureRandom}, URL-safe base64 (unguessable, #7). It is
 * stored as a <strong>deterministic SHA-256</strong> digest so the consume path can look it up by
 * {@code WHERE token_hash = ?} (row-salted bcrypt could not be queried; a random token needs no
 * slow hash). Package-private (invariant #11).
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
