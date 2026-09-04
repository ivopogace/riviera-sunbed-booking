package ai.riviera.platform.shared;

import java.util.function.Supplier;

/**
 * Signals that <em>request input</em> failed edge validation — the one exception
 * {@code ApiErrorHandler} maps to {@code 400 INVALID_REQUEST} (issue #118). Until #118 the advice
 * mapped every {@link IllegalArgumentException} there, which also caught deep-bug IAEs (a
 * {@code Money} or {@code PayoutLedgerEntry} invariant tripping on corrupt <em>stored</em> data) and
 * blamed them on the caller as an unlogged 400; a raw {@code IllegalArgumentException} now propagates
 * to the framework's logged 500, so only code that has actually inspected request input may produce
 * the 400.
 *
 * <p><strong>Where it may be thrown:</strong> edge code only — a controller or platform-edge helper
 * rejecting what the client sent (a missing field, a bad token, an unknown slug). Domain and
 * vocabulary guards keep throwing {@code IllegalArgumentException}; when the edge feeds them request
 * input it translates via {@link #parsing(Supplier)} at the conversion boundary, so the same guard
 * yields a 400 when fired by client input and a 500 when fired by corrupt stored state.
 *
 * <p>The message is for the log/cause chain only — {@code ApiErrorHandler} never echoes it on the
 * wire (it may quote user input or internals; §6b).
 *
 * <p>Lives in the Shared Kernel on the same ownership ground as {@link ApiProblem}: the edge
 * contract's vocabulary is owned by no module — module adapters throw it, and the one
 * advice consuming it sits at the composition root, which nothing may depend on.
 */
public final class InvalidApiRequestException extends RuntimeException {

	public InvalidApiRequestException(String message) {
		super(message);
	}

	public InvalidApiRequestException(String message, Throwable cause) {
		super(message, cause);
	}

	/**
	 * Run {@code conversion} — an expression turning request input into a command/typed value (a
	 * DTO's {@code toCommand()}, {@code PeriodKey.of}, an enum parse) — and rethrow any
	 * {@link IllegalArgumentException} it raises as this type, preserving it as the cause. Everything
	 * inside the conversion is by construction validating client input, so the translation cannot
	 * widen back onto stored-state bugs.
	 */
	public static <T> T parsing(Supplier<T> conversion) {
		try {
			return conversion.get();
		}
		catch (IllegalArgumentException invalidInput) {
			throw new InvalidApiRequestException(invalidInput.getMessage(), invalidInput);
		}
	}
}
