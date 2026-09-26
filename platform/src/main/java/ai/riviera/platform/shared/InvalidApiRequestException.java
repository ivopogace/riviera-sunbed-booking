package ai.riviera.platform.shared;

import java.util.function.Supplier;

/**
 * Request input failed edge validation: the one exception {@code ApiErrorHandler} maps to
 * {@code 400 INVALID_REQUEST}, never echoing the message on the wire. Throw it from edge code only.
 * Domain and vocabulary guards keep throwing {@link IllegalArgumentException} (a logged 500 when
 * stored data trips them); where client input feeds them, the edge translates via {@link #parsing}.
 * Contract: {@code riviera-java-conventions} §6b. Why {@code shared}, like {@link ApiProblem}:
 * {@code RESPONSIBILITIES.md} §{@code shared}.
 */
public final class InvalidApiRequestException extends RuntimeException {

	public InvalidApiRequestException(String message) {
		super(message);
	}

	public InvalidApiRequestException(String message, Throwable cause) {
		super(message, cause);
	}

	/**
	 * Runs {@code conversion} (a {@code toCommand()}, {@code PeriodKey.of}, an enum parse) and rethrows
	 * its {@link IllegalArgumentException} as this type, keeping the cause. Wrap only request-input
	 * conversions: anything reading stored state would turn a server bug into a 400.
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
