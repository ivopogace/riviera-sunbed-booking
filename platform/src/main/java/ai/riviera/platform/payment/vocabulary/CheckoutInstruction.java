package ai.riviera.platform.payment.vocabulary;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * How the payer's browser completes a pending collection (ADR-0029 decision 11): a closed set, so
 * callers {@code switch} exhaustively. {@code reference} is the provider's handle for the collection,
 * which its webhook correlates on. Handed out only where the booking code gates it (invariant #7).
 */
public sealed interface CheckoutInstruction permits CheckoutInstruction.Embedded, CheckoutInstruction.Redirect {

	/** The provider's handle for this collection. */
	String reference();

	/** Pay in a form embedded in our page; {@code clientToken} is what that form mounts with. */
	record Embedded(String clientToken, String reference) implements CheckoutInstruction {
	}

	/** Pay on the provider's own page at {@code url}, always https, since the browser is sent there unseen. */
	record Redirect(String url, String reference) implements CheckoutInstruction {

		private static final String HTTPS = "https";

		public Redirect {
			if (!isHttps(url)) {
				throw new IllegalArgumentException("a checkout redirect must be an https URL");
			}
		}

		private static boolean isHttps(String url) {
			try {
				String scheme = new URI(url).getScheme();
				return scheme != null && HTTPS.equals(scheme.toLowerCase(Locale.ROOT));
			}
			catch (URISyntaxException notAUrl) {
				return false;
			}
		}
	}
}
