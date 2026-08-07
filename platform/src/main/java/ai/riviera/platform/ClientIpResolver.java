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
 * Resolves the client IP used as the per-IP rate-limit key. The backend runs behind a proxy, so the
 * originating client address arrives in a forwarding header rather than as the direct socket address —
 * but those headers are entirely client-supplied, so honouring one blindly lets a caller rotate a
 * forged value and mint a fresh bucket per request (ADR-0006 risk R-2).
 *
 * <p><strong>The deployed topology is not the obvious one</strong>, and the difference is what the
 * client-IP header below exists for: the real chain is <em>client → CDN edge → Render → app</em>, so
 * the hop Render appends is a public edge address that varies per request. Read
 * {@code docs/runbooks/rate-limit-client-ip.md} before changing anything here — it carries the
 * measurements, including why the CDN's ranges must stay in the trust list, and the end-to-end probe
 * that is the only check no unit or slice test can replace.
 *
 * <p><strong>Trust model.</strong> The resolver is constructed with a list of trusted-proxy CIDRs
 * ({@code riviera.ratelimit.trusted-proxies}) and the name of an edge-supplied client-IP header
 * ({@code riviera.ratelimit.client-ip-header}), and resolves in this order:
 * <ol>
 * <li>if the socket peer is <em>not</em> a trusted proxy, every forwarding header is ignored and the
 * socket address is the key — a direct client cannot talk its way out of its own bucket;</li>
 * <li>otherwise, if the configured client-IP header carries exactly one IP literal, that is the key.
 * A CDN generates this header from the connection it terminated rather than appending to a
 * client-supplied copy, so behind a trusted peer it is unforgeable and needs no chain walk. It
 * removes the walk, <em>not</em> the trust list — the peer must still be classified;</li>
 * <li>otherwise walk {@code X-Forwarded-For} right-to-left and key on the first <em>untrusted</em>
 * hop — correct wherever the app sits directly behind an appending proxy, and the reason a non-CDN
 * deployment needs no configuration change;</li>
 * <li>if nothing usable is found, fall back to the socket address.</li>
 * </ol>
 * The header is all-or-nothing on purpose: repeated or non-literal values are discarded rather than
 * guessed at, because taking the first of several would let a client-supplied copy become the key.
 * Each way of losing the preferred path warns once per process, so a topology change that silently
 * demotes resolution to the walk leaves a trace instead of needing a log-<em>absence</em> deduction.
 *
 * <p>A hop that is not an IP literal ({@code unknown}, a hostname, garbage) can never be proven
 * trusted, so it is treated as a client value; it is validated with {@link InetAddress#ofLiteral}
 * first so a hostile hop can never trigger a DNS lookup.
 *
 * <p>An empty trusted-proxy list means "trust no proxy" — the socket address is always the key and the
 * client-IP header is never read. The shipped default trusts loopback, the RFC1918 ranges, link-local
 * and their IPv6 equivalents, which is right for an app directly behind a private proxy hop.
 * <strong>It is not sufficient on the deployed topology</strong>, where the peer is a public CDN
 * address; there the list is widened per environment via the property
 * ({@code docs/deploy/cd-pipeline.md}).
 *
 * <p>The headers are partly user-controlled, so the returned value is stripped of control characters
 * and the Unicode line/paragraph separators before it can reach a logger — log-forging and
 * terminal-escape injection. The value is only ever a map key and, at most, a {@code debug} log field.
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
	 * A configured client-IP header arriving from an <em>untrusted</em> peer is the fingerprint of the
	 * trusted-proxy list no longer covering the upstream edge's ranges. The header is still ignored —
	 * that is the bypass closure and is invariant-critical — but the warning names the likely cause on
	 * the first affected request rather than leaving it to be deduced from a missing log line.
	 * Interpolates only the header <em>name</em>, never its value, which is attacker-influenced whenever
	 * this fires.
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
	 * One trusted-proxy CIDR, guarded by address family. The guard is ours to keep: Spring Security
	 * 7.1's {@code IpInetAddressMatcher} compares the raw address bytes <em>without</em> checking that
	 * both are the same length, so a 4-byte IPv4 candidate walked against a 16-byte IPv6 range either
	 * matches across families by accident (any {@code 252.x} against {@code fc00::/7}) or indexes past
	 * the end of the shorter array (any {@code 0.x.y.z} against {@code ::1/128}, an
	 * {@code ArrayIndexOutOfBoundsException}). Every candidate here is attacker-supplied, so both
	 * outcomes are reachable from the internet — the length check must happen before the delegate runs.
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
