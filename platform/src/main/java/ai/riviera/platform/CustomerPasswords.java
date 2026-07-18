package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * The customer password policy + email normalization, shared by every edge surface that accepts a new
 * password or an email (login/register in {@code AuthController}, the S8 recovery/set-password
 * controllers). A stateless static helper — no bean, no Spring Security type — so the same rules apply
 * without threading a collaborator through each constructor (keeping them under the parameter budget).
 *
 * <p>Policy (design D-8): a server-side minimum length, capped at bcrypt's 72-byte input limit. A
 * violation throws {@link IllegalArgumentException}, which the single {@code ApiErrorHandler} maps to
 * {@code 400 INVALID_REQUEST} — the same contract every edge write already uses.
 */
final class CustomerPasswords {

	private static final int MIN_PASSWORD_LENGTH = 8;
	private static final int MAX_PASSWORD_BYTES = 72;

	private CustomerPasswords() {
	}

	/** Enforce the password policy before any encode/write; throws {@link IllegalArgumentException} if violated. */
	static void validate(String password) {
		int bytes = password.getBytes(StandardCharsets.UTF_8).length;
		if (password.length() < MIN_PASSWORD_LENGTH || bytes > MAX_PASSWORD_BYTES) {
			throw new IllegalArgumentException("password outside the permitted length");
		}
	}

	/** The canonical email form the module stores/looks up by (lower-cased + trimmed). */
	static String normalizeEmail(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}
}
