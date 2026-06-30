package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Pins client-IP resolution for per-IP rate-limit keying (issue #56, AC-6): the first
 * {@code X-Forwarded-For} hop is the client behind the Render proxy (ADR-0004); absence falls back to
 * the socket address; CR/LF in the (user-controlled) header is neutralised so it can never forge a
 * log line.
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

		String resolved = ClientIpResolver.resolve(request);
		assertEquals("203.0.113.7__FAKE LOG LINE", resolved);
	}

	@Test
	void unknownWhenNothingAvailable() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr(null);

		assertEquals("unknown", ClientIpResolver.resolve(request));
	}
}
