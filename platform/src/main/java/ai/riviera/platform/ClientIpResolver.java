package ai.riviera.platform;

import java.net.InetAddress;
import java.util.List;

import org.springframework.security.web.util.matcher.IpAddressMatcher;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Resolves the client IP used as the per-IP rate-limit key. The backend runs behind the Render proxy
 * (ADR-0004), so the originating client address arrives in {@code X-Forwarded-For} rather than as the
 * direct socket address — but that header is entirely client-supplied, so honouring it blindly let a
 * caller rotate a forged value and mint a fresh bucket per request (ADR-0006 risk R-2, issue #129).
 *
 * <p><strong>Trust model.</strong> The resolver is constructed with a list of trusted-proxy CIDRs
 * ({@code riviera.ratelimit.trusted-proxies}) and applies the MDN-recommended algorithm:
 * <ol>
 * <li>if the socket peer is <em>not</em> a trusted proxy, the header is ignored entirely and the
 * socket address is the key — a direct client cannot talk its way out of its own bucket;</li>
 * <li>otherwise walk {@code X-Forwarded-For} right-to-left and key on the first <em>untrusted</em>
 * hop. Render <em>appends</em> its observation of the peer rather than overwriting the header, so
 * the right-most untrusted hop is the proxy's own observation — unforgeable — while everything to
 * its left is attacker-controlled and must never be trusted;</li>
 * <li>if the header is absent, blank, or every hop is itself a trusted address, fall back to the
 * socket address.</li>
 * </ol>
 * A hop that is not an IP literal ({@code unknown}, a hostname, garbage) can never be proven
 * trusted, so it is treated as a client value; it is validated with {@link InetAddress#ofLiteral}
 * first so a hostile hop can never trigger a DNS lookup.
 *
 * <p>An empty trusted-proxy list means "trust no proxy" — the socket address is always the key. The
 * shipped default trusts loopback, the RFC1918 private ranges, link-local, and their IPv6
 * equivalents, which is correct for the locked Render topology (every internal hop is private); a
 * deployment exposed directly on a private network would want to narrow it via the property.
 *
 * <p>The header is partly user-controlled, so the returned value is stripped of control characters
 * (ASCII C0/C1 including CR/LF/TAB/ESC) and the Unicode line/paragraph separators before it can reach
 * a logger — neutralising log-forging and terminal-escape injection (the riviera-java-conventions
 * log-injection guard). The value is only ever used as a map key and, at most, a {@code debug} log
 * field; the booking code is never involved here (invariant #7).
 */
final class ClientIpResolver {

	private static final String FORWARDED_FOR = "X-Forwarded-For";
	private static final String UNKNOWN = "unknown";

	private final List<IpAddressMatcher> trustedProxies;

	ClientIpResolver(List<String> trustedProxyCidrs) {
		this.trustedProxies = trustedProxyCidrs.stream().map(IpAddressMatcher::new).toList();
	}

	String resolve(HttpServletRequest request) {
		String peer = request.getRemoteAddr();
		if (!isTrustedProxy(peer)) {
			return sanitise(peer);
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

	private boolean isTrustedProxy(String address) {
		if (address == null || address.isBlank()) {
			return false;
		}
		try {
			InetAddress.ofLiteral(address); // literal-only parse, so a hostile hop can never cause DNS
		}
		catch (IllegalArgumentException notAnIpLiteral) {
			return false;
		}
		return trustedProxies.stream().anyMatch(proxy -> proxy.matches(address));
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
