package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.payment.vocabulary.CheckoutInstruction;

/**
 * A checkout instruction flattened for the wire: one {@code kind} the client acts on, plus that kind's
 * fields. An exhaustive {@code switch} over the sealed type builds it, so a new kind is a compile error here.
 */
record CheckoutInstructionView(String kind, String clientToken, String url, String reference) {

	private static final String EMBEDDED = "EMBEDDED";
	private static final String REDIRECT = "REDIRECT";

	static CheckoutInstructionView of(CheckoutInstruction instruction) {
		return switch (instruction) {
			case CheckoutInstruction.Embedded(String clientToken, String reference) ->
					new CheckoutInstructionView(EMBEDDED, clientToken, null, reference);
			case CheckoutInstruction.Redirect(String url, String reference) ->
					new CheckoutInstructionView(REDIRECT, null, url, reference);
		};
	}
}
