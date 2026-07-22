package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Pins client-IP resolution for per-IP rate-limit keying (issue #56 AC-6, tightened by #129): the
 * header is honored only behind a <em>trusted</em> proxy peer, and the key is then the right-most
 * <em>untrusted</em> hop — the one Render appended, which a client cannot forge (ADR-0006 R-2).
 * Absence, blankness, or an all-trusted chain falls back to the socket address; control characters in
 * the (user-controlled) header are neutralised so it can never forge a log line or inject terminal
 * escapes.
 */
class ClientIpResolverTest {

	private static final List<String> DEFAULT_TRUSTED = List.of(
			"127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
			"169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10");

	private final ClientIpResolver resolver = new ClientIpResolver(DEFAULT_TRUSTED);

	@Test
	void resolvesClientBehindTrustedProxy() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1"); // the proxy hop — trusted, so the header is honored
		request.addHeader("X-Forwarded-For", "203.0.113.7, 10.0.0.1");

		assertEquals("203.0.113.7", resolver.resolve(request));
	}

	@Test
	void ignoresForwardedForFromUntrustedPeer() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.4"); // public peer — not a trusted proxy
		request.addHeader("X-Forwarded-For", "6.6.6.6");

		assertEquals("198.51.100.4", resolver.resolve(request));
	}

	@Test
	void resolvesRightmostUntrustedHopBehindTrustedProxy() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		// Attacker-forged prefix + the hop Render appended; only the right-most one is trustworthy.
		request.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.7");

		assertEquals("203.0.113.7", resolver.resolve(request));
	}

	@Test
	void fallsBackToPeerWhenAllHopsTrusted() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("127.0.0.1");
		request.addHeader("X-Forwarded-For", "10.1.1.1, 192.168.0.9");

		assertEquals("127.0.0.1", resolver.resolve(request));
	}

	@Test
	void treatsNonIpLiteralHopAsClientWithoutDns() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("127.0.0.1");
		// A non-literal can never be proven trusted, so it is treated as the client value — no DNS (R-4).
		request.addHeader("X-Forwarded-For", "unknown, 10.0.0.1");

		assertEquals("unknown", resolver.resolve(request));
	}

	@Test
	void fallsBackToRemoteAddrWhenHeaderAbsent() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.4");

		assertEquals("198.51.100.4", resolver.resolve(request));
	}

	@Test
	void fallsBackWhenHeaderBlank() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.9"); // trusted, so the blank header is genuinely reached
		request.addHeader("X-Forwarded-For", "   ");

		assertEquals("10.0.0.9", resolver.resolve(request));
	}

	@Test
	void sanitisesNewlinesToPreventLogForging() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("127.0.0.1");
		request.addHeader("X-Forwarded-For", "203.0.113.7\r\nFAKE LOG LINE");

		assertEquals("203.0.113.7__FAKE LOG LINE", resolver.resolve(request));
	}

	@Test
	void sanitisesOtherControlCharsAndSeparators() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("127.0.0.1");
		// A tab, an ANSI ESC (0x1B) and a Unicode line separator (U+2028) must all be neutralised; an
		// ordinary space is preserved. Built via casts so the source carries no raw control bytes.
		String forged = "1.2.3.4" + ((char) 0x09) + ((char) 0x1b) + ((char) 0x2028) + " x";
		request.addHeader("X-Forwarded-For", forged);

		assertEquals("1.2.3.4___ x", resolver.resolve(request));
	}

	@Test
	void unknownWhenNothingAvailable() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr(null);

		assertEquals("unknown", resolver.resolve(request));
	}

	@Test
	void survivesAnIpv4HopComparedAgainstTheIpv6TrustRanges() {
		// Spring Security 7.1's IpInetAddressMatcher compares raw bytes WITHOUT a length check, so a
		// 4-byte IPv4 hop walked against ::1/128 (16 bytes, leading zeros) indexes past the array end.
		// Any 0.x.y.z hop is attacker-supplied, so an unguarded walk is a remote 500 on every limited
		// endpoint.
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader("X-Forwarded-For", "0.0.0.0");

		assertEquals("0.0.0.0", resolver.resolve(request));
	}

	@Test
	void doesNotTrustAnIpv4HopThatCollidesWithAnIpv6Range() {
		// 252.x/253.x share fc00::/7's masked leading byte; without a family guard the byte compare
		// would call a public IPv4 hop a trusted proxy and skip it.
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader("X-Forwarded-For", "252.1.2.3");

		assertEquals("252.1.2.3", resolver.resolve(request));
	}

	@Test
	void doesNotTrustAnIpv6HopThatCollidesWithAnIpv4Range() {
		// a9fe:… shares 169.254.0.0/16's first two bytes; the family guard keeps it a client value.
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader("X-Forwarded-For", "a9fe::1");

		assertEquals("a9fe::1", resolver.resolve(request)); // the raw hop is the key, not a normalised form
	}

	@Test
	void integrationTestClientIpsStayDistinctBuckets() {
		// AC-4 / #127: the ~19 IT files isolate their rate buckets with a unique single-hop
		// X-Forwarded-For from the loopback MockMvc peer. That only works while the generated address
		// is UNTRUSTED — a private-range one would be skipped as a proxy hop and every IT in the suite
		// would collapse onto the 127.0.0.1 bucket.
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("127.0.0.1");
		String testClient = SessionLoginSupport.uniqueClientIp();
		request.addHeader("X-Forwarded-For", testClient);

		assertEquals(testClient, resolver.resolve(request));
	}

	@Test
	void emptyTrustListTrustsNoProxyAndKeysOnTheSocketAddress() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("127.0.0.1");
		request.addHeader("X-Forwarded-For", "6.6.6.6");

		assertEquals("127.0.0.1", new ClientIpResolver(List.of()).resolve(request));
	}
}
