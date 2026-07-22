package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Pins client-IP resolution for per-IP rate-limit keying (issue #56 AC-6, tightened by #129, made
 * durable by #286): the forwarding headers are honored only behind a <em>trusted</em> proxy peer.
 * Behind one, an edge-supplied client-IP header wins outright when it is usable; otherwise the key is
 * the right-most <em>untrusted</em> {@code X-Forwarded-For} hop, which a client cannot forge (ADR-0006
 * R-2). Absence, blankness, or an all-trusted chain falls back to the socket address; control
 * characters in the (user-controlled) header are neutralised so it can never forge a log line or
 * inject terminal escapes.
 */
class ClientIpResolverTest {

	private static final List<String> DEFAULT_TRUSTED = List.of(
			"127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
			"169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10");
	private static final String CF_HEADER = "CF-Connecting-IP";

	/** No edge header configured — every #129 case below asserts the walk is unchanged (#286 AC-3). */
	private final ClientIpResolver resolver = new ClientIpResolver(DEFAULT_TRUSTED, "");
	private final ClientIpResolver edgeAware = new ClientIpResolver(DEFAULT_TRUSTED, CF_HEADER);

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

	/**
	 * Spring Security 7.1's {@code IpInetAddressMatcher} compares raw address bytes without a length
	 * check, so a 4-byte IPv4 hop walked against {@code ::1/128} (16 bytes, leading zeros) indexes past
	 * the end of the array. Any {@code 0.x.y.z} hop is attacker-supplied, so an unguarded walk is a
	 * remote 500 on every rate-limited endpoint.
	 */
	@Test
	void survivesAnIpv4HopComparedAgainstTheIpv6TrustRanges() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader("X-Forwarded-For", "0.0.0.0");

		assertEquals("0.0.0.0", resolver.resolve(request));
	}

	/**
	 * {@code 252.x}/{@code 253.x} share {@code fc00::/7}'s masked leading byte, so without the family
	 * guard the byte compare would call a public IPv4 hop a trusted proxy and skip past it.
	 */
	@Test
	void doesNotTrustAnIpv4HopThatCollidesWithAnIpv6Range() {
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

	/**
	 * AC-4 / #127: the IT corpus isolates its rate buckets with a unique single-hop
	 * {@code X-Forwarded-For} from the loopback MockMvc peer. That only works while the generated
	 * address is <em>untrusted</em> — a private-range one would be skipped as a proxy hop and every IT
	 * in the suite would collapse onto the one {@code 127.0.0.1} bucket.
	 */
	@Test
	void integrationTestClientIpsStayDistinctBuckets() {
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

		assertEquals("127.0.0.1", new ClientIpResolver(List.of(), CF_HEADER).resolve(request));
	}

	// ---- The edge-supplied client-IP header is preferred over the chain walk (#286) ----

	@Test
	void prefersTheEdgeSuppliedClientOverTheForwardedChain() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader("X-Forwarded-For", "6.6.6.6, 198.51.100.9");
		request.addHeader(CF_HEADER, "203.0.113.7");

		assertEquals("203.0.113.7", edgeAware.resolve(request));
	}

	@Test
	void ignoresTheClientIpHeaderFromAnUntrustedPeer() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("198.51.100.4"); // public peer — not a trusted proxy
		request.addHeader(CF_HEADER, "6.6.6.6");

		assertEquals("198.51.100.4", edgeAware.resolve(request));
	}

	@Test
	void fallsBackToTheForwardedWalkWhenTheHeaderIsAbsent() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.7");

		assertEquals("203.0.113.7", edgeAware.resolve(request));
	}

	@Test
	void ignoresAMultiValuedClientIpHeader() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		// Taking first-of-many would hand the key to a client-supplied copy, so all of it is discarded.
		request.addHeader(CF_HEADER, "6.6.6.6");
		request.addHeader(CF_HEADER, "203.0.113.7");
		request.addHeader("X-Forwarded-For", "1.2.3.4, 198.51.100.9");

		assertEquals("198.51.100.9", edgeAware.resolve(request));
	}

	@Test
	void ignoresANonLiteralClientIpHeader() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1");
		request.addHeader(CF_HEADER, "203.0.113.7, 6.6.6.6"); // a chain, not a single address
		request.addHeader("X-Forwarded-For", "1.2.3.4, 198.51.100.9");

		assertEquals("198.51.100.9", edgeAware.resolve(request));
	}

	/**
	 * The measured production shape (#286): client → Cloudflare edge → Render → app, with only the
	 * SHIPPED private ranges trusted. The chain's right-most hop is the public, per-request-varying
	 * Cloudflare edge, so the walk keys on the edge node; the edge-supplied header keys on the client.
	 */
	@Test
	void resolvesTheClientOnACloudflareShapedChainWithoutCloudflareCidrs() {
		assertEquals("203.0.113.7", edgeAware.resolve(cloudflareShaped(true)));
	}

	@Test
	void withoutTheHeaderTheWalkStillKeysOnTheEdgeHop() {
		assertEquals("162.158.1.1", resolver.resolve(cloudflareShaped(false)));
	}

	private static MockHttpServletRequest cloudflareShaped(boolean withEdgeHeader) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.1"); // Render's internal hop — private, trusted by default
		request.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.7, 162.158.1.1");
		if (withEdgeHeader) {
			request.addHeader(CF_HEADER, "203.0.113.7");
		}
		return request;
	}

	@Test
	void warnsOnceWhenTheConfiguredHeaderIsMissing() {
		Logger logger = (Logger) LoggerFactory.getLogger(ClientIpResolver.class);
		ListAppender<ILoggingEvent> appender = new ListAppender<>();
		appender.start();
		logger.addAppender(appender);
		try {
			ClientIpResolver fresh = new ClientIpResolver(DEFAULT_TRUSTED, CF_HEADER);
			MockHttpServletRequest request = new MockHttpServletRequest();
			request.setRemoteAddr("10.0.0.1");
			fresh.resolve(request);
			fresh.resolve(request);

			assertEquals(1, appender.list.stream().filter(e -> e.getLevel() == Level.WARN).count());
		}
		finally {
			logger.detachAppender(appender);
		}
	}
}
