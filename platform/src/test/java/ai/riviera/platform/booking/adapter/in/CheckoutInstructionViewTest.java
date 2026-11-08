package ai.riviera.platform.booking.adapter.in;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.vocabulary.CheckoutInstruction;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CheckoutInstructionViewTest {

	@Test
	void anEmbeddedInstructionNamesItsKindAndToken() {
		assertEquals(new CheckoutInstructionView("EMBEDDED", "cs_1", null, "pi_1"),
				CheckoutInstructionView.of(new CheckoutInstruction.Embedded("cs_1", "pi_1")));
	}

	@Test
	void aRedirectInstructionNamesItsKindAndUrl() {
		assertEquals(new CheckoutInstructionView("REDIRECT", null, "https://pay.example.test/o/1", "ord_1"),
				CheckoutInstructionView.of(new CheckoutInstruction.Redirect("https://pay.example.test/o/1", "ord_1")));
	}
}
