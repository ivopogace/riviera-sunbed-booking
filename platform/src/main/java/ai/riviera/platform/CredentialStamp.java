package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * The digest of an account and its stored password hash that a {@link SessionPrincipal} carries and
 * {@link SessionCredentialFilter} recomputes per request (#1306); the session store never holds the hash. A
 * {@code null} hash (an SSO-only customer) stamps as empty; bcrypt re-salts, so re-encoding a password changes it.
 */
final class CredentialStamp {

	private CredentialStamp() {
	}

	/** Keyed on the account id, so a later account under the same email never matches an earlier one's session. */
	static String customer(CustomerAccountId accountId, String passwordHash) {
		return digest("customer:" + accountId.value(), passwordHash);
	}

	static String operator(String username, String passwordHash) {
		return digest("operator:" + username, passwordHash);
	}

	private static String digest(String account, String passwordHash) {
		String input = account + '\n' + (passwordHash == null ? "" : passwordHash);
		return HexFormat.of().formatHex(sha256().digest(input.getBytes(StandardCharsets.UTF_8)));
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
