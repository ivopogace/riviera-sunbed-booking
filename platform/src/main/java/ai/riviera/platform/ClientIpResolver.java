package ai.riviera.platform;

import java.net.InetAddress;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.util.matcher.InetAddressMatcher;
import org.springframework.security.util.matcher.InetAddressMatchers;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The per-IP rate-limit key. Forwarding headers are client-supplied: believed blindly, a forged value mints a
 * fresh bucket per request (ADR-0006 R-2). An untrusted socket peer is keyed on itself, every header ignored;
 * behind a trusted peer the configured client-IP header wins if it is exactly one IP literal (repeated or
 * non-literal is discarded, never guessed), else the first untrusted {@code X-Forwarded-For} hop walking
 * right-to-left, else the peer. Unparseable hops are never trusted and never resolved via DNS; the key is
 * stripped of control chars (log forging). Read docs/runbooks/rate-limit-client-ip.md before changing this.
 */
final class ClientIpResolver {

	private static final Logger log = LoggerFactory.getLogger(ClientIpResolver.class);

	private static final String FORWARDED_FOR = "X-Forwarded-For";
	private static final String UNKNOWN = "unknown";

	private final List<TrustedProxy> trustedProxies;
	private final String clientIpHeader;
	private final AtomicBoolean absenceWarned = new AtomicBoolean();
	private final AtomicBoolean ambiguityWarned = new AtomicBoolean();
	private final AtomicBoolean untrustedPeerWarned = new AtomicBoolean();

	ClientIpResolver(List<String> trustedProxyCidrs, String clientIpHeader) {
		this.trustedProxies = trustedProxyCidrs.stream().map(TrustedProxy::of).toList();
		this.clientIpHeader = clientIpHeader == null ? "" : clientIpHeader.trim();
	}

	String resolve(HttpServletRequest request) {
		String peer = request.getRemoteAddr();
		if (!isTrustedProxy(peer)) {
			warnOnClientIpHeaderFromUntrustedPeer(request);
			return sanitise(peer);
		}
		String edgeClient = edgeSuppliedClient(request);
		if (edgeClient != null) {
			return edgeClient;
		}
		String forwarded = request.getHeader(FORWARDED_FOR);
		if (forwarded != null && !forwarded.isBlank()) {
			String[] hops = forwarded.split(",");
			for (int i = hops.length - 1; i >= 0; i--) {
				String hop = hops[i].trim();
				if (!hop.isEmpty() && !isTrustedProxy(hop)) {
					return sanitise(hop);
				}
			}
		}
		return sanitise(peer);
	}

	/**
	 * The client address the upstream edge computed for us, or {@code null} when no header is
	 * configured or the configured one is unusable — absent, repeated, or not a single IP literal.
	 * Only ever consulted behind a trusted peer.
	 */
	private String edgeSuppliedClient(HttpServletRequest request) {
		if (clientIpHeader.isEmpty()) {
			return null;
		}
		List<String> values = Collections.list(request.getHeaders(clientIpHeader));
		if (values.isEmpty()) {
			warnOnce(absenceWarned, "is absent");
			return null;
		}
		if (values.size() > 1) {
			warnOnce(ambiguityWarned, "arrived more than once");
			return null;
		}
		String value = values.getFirst().trim();
		if (ipLiteral(value) == null) {
			warnOnce(ambiguityWarned, "is not a single IP literal");
			return null;
		}
		return sanitise(value);
	}

	/** Never interpolates the header VALUE — it is attacker-influenced whenever this fires. */
	private void warnOnce(AtomicBoolean latch, String problem) {
		if (latch.compareAndSet(false, true)) {
			log.warn("Client-IP header '{}' {} behind a trusted proxy peer; falling back to the {} walk. "
					+ "Rate-limit buckets may be keyed per edge node rather than per client — see "
					+ "docs/runbooks/rate-limit-client-ip.md", clientIpHeader, problem, FORWARDED_FOR);
		}
	}

	/**
	 * A client-IP header from an <em>untrusted</em> peer stays ignored (the bypass closure) but warns once: it
	 * fingerprints a trusted-proxy list that is missing the edge's ranges. Interpolates only the header
	 * <em>name</em>, never its attacker-influenced value.
	 */
	private void warnOnClientIpHeaderFromUntrustedPeer(HttpServletRequest request) {
		if (clientIpHeader.isEmpty() || request.getHeader(clientIpHeader) == null) {
			return;
		}
		if (untrustedPeerWarned.compareAndSet(false, true)) {
			log.warn("Client-IP header '{}' arrived from an UNTRUSTED socket peer and was ignored "
					+ "(bypass closure #129). This is the fingerprint of the trusted-proxy list missing the "
					+ "upstream edge's ranges — see docs/runbooks/rate-limit-client-ip.md", clientIpHeader);
		}
	}

	private boolean isTrustedProxy(String address) {
		InetAddress candidate = ipLiteral(address);
		return candidate != null && trustedProxies.stream().anyMatch(proxy -> proxy.matches(candidate));
	}

	/**
	 * The parsed address, or {@code null} when {@code value} is not an IP literal. Literal-only — a
	 * hostile hop or header value must never trigger a DNS lookup, and anything unparseable can never
	 * be proven trusted.
	 */
	private static InetAddress ipLiteral(String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		try {
			return InetAddress.ofLiteral(value);
		}
		catch (IllegalArgumentException notAnIpLiteral) {
			return null;
		}
	}

	/**
	 * One trusted-proxy CIDR, guarded by address family — keep the guard: Spring Security 7.1's
	 * {@code IpInetAddressMatcher} compares raw bytes without a length check, so an attacker-supplied IPv4
	 * candidate against an IPv6 range matches by accident ({@code 252.x} vs {@code fc00::/7}) or throws
	 * {@code ArrayIndexOutOfBoundsException} ({@code 0.x.y.z} vs {@code ::1/128}).
	 *
	 * @param addressLength byte length of the CIDR's network address: 4 for IPv4, 16 for IPv6
	 */
	private record TrustedProxy(int addressLength, InetAddressMatcher matcher) {

		static TrustedProxy of(String cidr) {
			String network = cidr.split("/", 2)[0];
			return new TrustedProxy(InetAddress.ofLiteral(network).getAddress().length,
					InetAddressMatchers.fromIpAddress(cidr));
		}

		boolean matches(InetAddress candidate) {
			return candidate.getAddress().length == addressLength && matcher.matches(candidate);
		}
	}

	private static String sanitise(String value) {
		if (value == null || value.isBlank()) {
			return UNKNOWN;
		}
		// Strip ASCII control chars (C0/C1: CR, LF, TAB, ESC, …) + Unicode line/paragraph separators,
		// so a forged header can neither inject a fake log line nor smuggle terminal escapes.
		return value.replaceAll("[\\p{Cntrl}\\u0085\\u2028\\u2029]", "_");
	}
}
