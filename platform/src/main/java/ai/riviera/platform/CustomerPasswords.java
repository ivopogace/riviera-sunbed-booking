package ai.riviera.platform;

import java.nio.charset.StandardCharsets;

/**
 * The customer password policy, shared by every edge surface that accepts a new
 * password (login/register in {@code AuthController}, the S8 recovery/set-password
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

	/**
	 * Whether a current-password field was supplied at all — the one definition shared by both self-service
	 * change endpoints (#345), so the operator and customer twins cannot drift on what "supplied" means.
	 * The test is <em>empty</em>, never blank: the policy above forbids a stored password under
	 * {@value #MIN_PASSWORD_LENGTH} characters so {@code ""} can never be a real one, while leading and
	 * trailing spaces are significant and must survive (the S8 set-password review fix).
	 */
	static boolean isSupplied(String password) {
		return password != null && !password.isEmpty();
	}

	/** Enforce the password policy before any encode/write; throws {@link IllegalArgumentException} if violated. */
	static void validate(String password) {
		int bytes = password.getBytes(StandardCharsets.UTF_8).length;
		if (password.length() < MIN_PASSWORD_LENGTH || bytes > MAX_PASSWORD_BYTES) {
			throw new IllegalArgumentException("password outside the permitted length");
		}
	}

}
