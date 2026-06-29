package ai.riviera.platform.booking.infrastructure.out;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the booking code is an unguessable bearer credential (issue #6, AC-6 / invariant
 * #7): fixed length ≥ 8, drawn only from the unambiguous base32 alphabet, and effectively
 * unique (no collisions / no sequential pattern) across many draws. Pure unit test in the
 * adapter's package.
 */
class SecureRandomBookingCodeGeneratorTest {

	private static final String ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";

	private final SecureRandomBookingCodeGenerator generator = new SecureRandomBookingCodeGenerator();

	@Test
	void entropyAndCharset() {
		Set<String> seen = new HashSet<>();
		for (int i = 0; i < 5_000; i++) {
			String code = generator.next();
			assertTrue(code.length() >= 8, "code must carry enough entropy (>= 8 chars)");
			assertEquals(10, code.length(), "U3 codes are 10 chars (~50 bits)");
			for (char c : code.toCharArray()) {
				assertTrue(ALPHABET.indexOf(c) >= 0,
						"code uses only the unambiguous base32 alphabet, got '" + c + "'");
			}
			assertTrue(seen.add(code),
					"codes must not repeat across draws (random, not sequential)");
		}
	}
}
