package ai.riviera.platform.operator.vocabulary;

/**
 * Thrown by {@link ai.riviera.platform.operator.api.OperatorDirectory#requireOperator OperatorDirectory.requireOperator}
 * when the principal name resolves to no operator in the may-operate set: it owns nothing. Framework-free; {@code web}'s
 * {@code @RestControllerAdvice} maps it to {@code 403 ACCESS_DENIED}. The message never echoes the principal name.
 */
public final class NoOperableOperatorException extends RuntimeException {

	public NoOperableOperatorException() {
		super("principal resolves to no operable operator");
	}
}
