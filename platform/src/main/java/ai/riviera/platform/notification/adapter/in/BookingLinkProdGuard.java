package ai.riviera.platform.notification.adapter.in;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fail-fast guard, the booking-link sibling of {@code SuppressionPepperProdGuard}: under {@code prod}
 * the origin every booking mail links to must not be a loopback host, or every mail carries a dead
 * link. Its constructor throws when the base is blank or loopback ({@code localhost}, 127.0.0.0/8,
 * {@code ::1}); the committed default is loopback. {@code auth}'s {@code RecoveryLinkProdGuard}
 * guards the other key fed by the same variable. Package-private (invariant #11); pinned by
 * {@code BookingLinkProdGuardTest}.
 */
@Component
@Profile("prod")
class BookingLinkProdGuard {

	private static final Pattern IP_LITERAL = Pattern.compile("\\[[0-9a-fA-F:.]+]|\\d{1,3}(\\.\\d{1,3}){3}");

	BookingLinkProdGuard(
			@Value("${riviera.notification.booking-link.base-url:}") String baseUrl) {
		if (baseUrl.isBlank() || isLoopback(baseUrl.strip())) {
			throw new IllegalStateException(
					"riviera.notification.booking-link.base-url must be a real origin under the 'prod' profile, "
							+ "not blank or a loopback host — set RIVIERA_RECOVERY_LINK_BASE_URL");
		}
	}

	static boolean isLoopback(String baseUrl) {
		String host;
		try {
			host = URI.create(baseUrl).getHost();
		} catch (IllegalArgumentException e) {
			return false;
		}
		if (host == null) {
			return false;
		}
		String lower = host.toLowerCase(Locale.ROOT);
		if (lower.equals("localhost") || lower.endsWith(".localhost")) {
			return true;
		}
		if (!IP_LITERAL.matcher(lower).matches()) {
			return false;
		}
		try {
			return InetAddress.getByName(lower).isLoopbackAddress();
		} catch (UnknownHostException e) {
			return false;
		}
	}
}
