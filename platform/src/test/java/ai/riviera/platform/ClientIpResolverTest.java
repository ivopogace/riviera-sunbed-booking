package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Pins client-IP resolution for per-IP rate-limit keying (issue #56, AC-6): the first
 * {@code X-Forwarded-For} hop is the client behind the Render proxy (ADR-0004); absence falls back to
 * the socket address; control characters in the (user-controlled) header are neutralised so it can
 * never forge a log line or inject terminal escapes.
 */
class ClientIpResolverTest {

	@Test
	void usesFirstForwardedForHop() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1"); // the proxy hop — must be ignored
		request.addHeader("X-Forwarded-For", "203.0.113.7, 10.0.0.1");

		assertEquals("203.0.113.7", ClientIpResolver.resolve(request));
	}

	@Test
	void fallsBackToRemoteAddrWhenHeaderAbsent() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.4");

		assertEquals("198.51.100.4", ClientIpResolver.resolve(request));
	}

	@Test
	void fallsBackWhenHeaderBlank() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.9");
		request.addHeader("X-Forwarded-For", "   ");

		assertEquals("198.51.100.9", ClientIpResolver.resolve(request));
	}

	@Test
	void sanitisesNewlinesToPreventLogForging() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader("X-Forwarded-For", "203.0.113.7\r\nFAKE LOG LINE");

		assertEquals("203.0.113.7__FAKE LOG LINE", ClientIpResolver.resolve(request));
	}

	@Test
	void sanitisesOtherControlCharsAndSeparators() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		// A tab, an ANSI ESC (0x1B) and a Unicode line separator (U+2028) must all be neutralised; an
		// ordinary space is preserved. Built via casts so the source carries no raw control bytes.
		String forged = "1.2.3.4" + ((char) 0x09) + ((char) 0x1b) + ((char) 0x2028) + " x";
		request.addHeader("X-Forwarded-For", forged);

		assertEquals("1.2.3.4___ x", ClientIpResolver.resolve(request));
	}

	@Test
	void unknownWhenNothingAvailable() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr(null);

		assertEquals("unknown", ClientIpResolver.resolve(request));
	}
}
