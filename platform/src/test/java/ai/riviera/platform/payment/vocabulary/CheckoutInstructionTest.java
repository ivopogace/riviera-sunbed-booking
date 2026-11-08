package ai.riviera.platform.payment.vocabulary;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CheckoutInstructionTest {

	@Test
	void aRedirectKeepsItsHttpsUrl() {
		assertEquals("HTTPS://pay.example.test/o/1", new CheckoutInstruction.Redirect("HTTPS://pay.example.test/o/1", "ref").url());
	}

	@ParameterizedTest
	@ValueSource(strings = {"http://pay.example.test/o/1", "javascript:alert(1)", "/relative/path", "not a url", ""})
	void aRedirectRefusesAnythingButHttps(String url) {
		assertThrows(IllegalArgumentException.class, () -> new CheckoutInstruction.Redirect(url, "ref"));
	}
}
