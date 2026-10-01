package ai.riviera.platform.customer.vocabulary;

/**
 * Thrown by {@link ai.riviera.platform.customer.api.CustomerAccountDirectory#requireSignedInAccount
 * CustomerAccountDirectory.requireSignedInAccount} when the principal is not a signed-in customer with a live
 * account. Framework-free; {@code web}'s {@code @RestControllerAdvice} maps it to {@code 403 ACCESS_DENIED}. The message
 * never echoes the principal's email.
 */
public final class NotSignedInCustomerException extends RuntimeException {

	public NotSignedInCustomerException() {
		super("not an authenticated customer");
	}
}
