package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * The digest of a stored password hash that a {@link SessionPrincipal} carries and {@link SessionCredentialFilter}
 * recomputes per request (#1306), so the session store never holds the hash itself. A {@code null} hash (an
 * SSO-only customer) stamps as the empty string. bcrypt re-salts, so re-encoding the same password changes it.
 */
final class CredentialStamp {

	private CredentialStamp() {
	}

	static String of(String passwordHash) {
		String hash = passwordHash == null ? "" : passwordHash;
		return HexFormat.of().formatHex(sha256().digest(hash.getBytes(StandardCharsets.UTF_8)));
	}

	private static MessageDigest sha256() {
		try {
			return MessageDigest.getInstance("SHA-256");
		}
		catch (NoSuchAlgorithmException unavailable) {
			throw new IllegalStateException("every Java platform provides SHA-256", unavailable);
		}
	}
}
