package ai.riviera.platform.auth.vocabulary;

/**
 * A new password contains a blocked term — the service name or the account's own name
 * ({@code PasswordPolicy}). Thrown only by edge code and mapped once by {@code ApiErrorHandler} to
 * {@code 400 PASSWORD_CONTAINS_BLOCKED_TERM}, distinct from the length rule's {@code INVALID_REQUEST}
 * so a client can name the rule that failed. The message names the rule, never the matched term,
 * which would echo user input.
 */
public final class BlockedPasswordException extends RuntimeException {

	public BlockedPasswordException() {
		super("password contains a blocked term");
	}
}
