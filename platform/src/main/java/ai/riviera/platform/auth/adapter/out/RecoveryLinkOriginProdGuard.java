package ai.riviera.platform.auth.adapter.out;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fail-fast guard, the link-origin sibling of {@code SuppressionPepperProdGuard}: under {@code prod}
 * the origin behind {@code riviera.recovery.link-base-url} must not be blank, relative, unparsable or a loopback host
 * ({@code localhost}, {@code 127.0.0.0/8}, {@code ::1}), or every mailed link points at a dead origin.
 * Guards only this module's own key. Package-private (invariant #11); pinned by {@code RecoveryLinkOriginProdGuardTest}.
 */
@Component
@Profile("prod")
class RecoveryLinkOriginProdGuard {

	private static final Pattern IPV4_LITERAL = Pattern.compile("((25[0-5]|2[0-4]\\d|1?\\d?\\d)(\\.|$)){4}");

	RecoveryLinkOriginProdGuard(@Value("${riviera.recovery.link-base-url:}") String baseUrl) {
		if (baseUrl.isBlank() || isUnusable(baseUrl.strip())) {
			throw new IllegalStateException(
					"riviera.recovery.link-base-url must be a real, absolute, non-loopback origin under the 'prod' profile — set "
							+ "RIVIERA_RECOVERY_LINK_BASE_URL to the deployed origin (was '" + baseUrl + "')");
		}
	}

	private static boolean isUnusable(String baseUrl) {
		String host;
		try {
			host = URI.create(baseUrl).getHost();
		} catch (IllegalArgumentException e) {
			return true;
		}
		if (host == null) {
			return true;
		}
		String bare = host.toLowerCase(Locale.ROOT);
		bare = bare.endsWith(".") ? bare.substring(0, bare.length() - 1) : bare;
		if (bare.startsWith("[") && bare.endsWith("]")) {
			bare = bare.substring(1, bare.length() - 1);
		}
		if ("localhost".equals(bare)) {
			return true;
		}
		// Only IP literals are handed to InetAddress, so no DNS lookup can happen.
		if (bare.indexOf(':') >= 0 || IPV4_LITERAL.matcher(bare).matches()) {
			try {
				return InetAddress.getByName(bare).isLoopbackAddress();
			} catch (UnknownHostException e) {
				return false;
			}
		}
		return false;
	}
}
