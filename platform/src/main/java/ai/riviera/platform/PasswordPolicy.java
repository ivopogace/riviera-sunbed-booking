package ai.riviera.platform;

import ai.riviera.platform.shared.InvalidApiRequestException;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * The one password policy every edge surface that accepts a new password enforces — tourist and
 * operator register, reset, set, and both self-service changes — plus the bootstrap credential's
 * length rule. A stateless static helper — no bean, no Spring Security type — so the same rule
 * applies without threading a collaborator through each constructor.
 *
 * <p>Policy (design D-8): {@value #MIN_LENGTH} characters to {@value #MAX_BYTES} bytes (bcrypt's input
 * cap), leading and trailing spaces significant, no composition rules; and the password may not
 * contain, case-insensitively, the service name or the account's own name (the email local part for
 * a tourist, the username for an operator). A length violation throws
 * {@link InvalidApiRequestException} ({@code 400 INVALID_REQUEST}); a blocklist hit throws
 * {@link BlockedPasswordException} ({@code 400 PASSWORD_CONTAINS_BLOCKED_TERM}) so a client can say
 * which rule failed. Length is checked first. Rationale: {@code RESPONSIBILITIES.md} § Platform edge.
 */
final class PasswordPolicy {

	static final int MIN_LENGTH = 12;
	static final int MAX_BYTES = 72;
	/** An account name shorter than this is not applied as a blocked term — it would match almost anything. */
	static final int MIN_ACCOUNT_NAME_LENGTH = 3;
	private static final String SERVICE_NAME = "riviera";

	private PasswordPolicy() {
	}

	/**
	 * Whether a current-password field was supplied at all — the one definition shared by both self-service
	 * change endpoints, so the operator and customer twins cannot drift on what "supplied" means.
	 * The test is <em>empty</em>, never blank: the policy forbids a stored password under
	 * {@value #MIN_LENGTH} characters so {@code ""} can never be a real one, while leading and
	 * trailing spaces are significant and must survive.
	 */
	static boolean isSupplied(String password) {
		return password != null && !password.isEmpty();
	}

	/** Whether {@code password} is within the length bounds — the check the bootstrap credential shares. */
	static boolean hasPermittedLength(String password) {
		int bytes = password.getBytes(StandardCharsets.UTF_8).length;
		return password.length() >= MIN_LENGTH && bytes <= MAX_BYTES;
	}

	/** Enforce the length rule and the service-name block before any encode/write. */
	static void validate(String password) {
		if (!hasPermittedLength(password)) {
			throw new InvalidApiRequestException("password outside the permitted length");
		}
		if (contains(password, SERVICE_NAME)) {
			throw new BlockedPasswordException();
		}
	}

	/**
	 * {@link #validate(String)} plus the account's own name as a blocked term: the email local part for
	 * a tourist, the username for an operator. A name under {@value #MIN_ACCOUNT_NAME_LENGTH} characters is skipped.
	 */
	static void validate(String password, String accountName) {
		validate(password);
		if (accountName.length() >= MIN_ACCOUNT_NAME_LENGTH && contains(password, accountName)) {
			throw new BlockedPasswordException();
		}
	}

	/** The part of {@code email} before the {@code @}, lower-cased — the tourist's account name. */
	static String emailLocalPart(String email) {
		int at = email.indexOf('@');
		String localPart = at < 0 ? email : email.substring(0, at);
		return localPart.toLowerCase(Locale.ROOT);
	}

	private static boolean contains(String password, String term) {
		return password.toLowerCase(Locale.ROOT).contains(term.toLowerCase(Locale.ROOT));
	}

}
