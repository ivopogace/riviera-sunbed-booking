package ai.riviera.platform.auth.application;

import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The SHA-256 (hex) of the metrics scraper's token, in two slots so a rotation can overlap (ADR-0032); the
 * token itself is never configured here. Unset, every scrape is refused. Minting and rotation:
 * {@code docs/runbooks/observability.md}.
 */
@ConfigurationProperties(ScrapeTokenProperties.PREFIX)
public record ScrapeTokenProperties(String scrapeTokenSha256, String scrapeTokenSha256Next) {

	static final String PREFIX = "riviera.observability";

	private static final Pattern HEX_SHA256 = Pattern.compile("[0-9a-f]{64}");

	public ScrapeTokenProperties {
		scrapeTokenSha256 = normalized(PREFIX + ".scrape-token-sha256", scrapeTokenSha256);
		scrapeTokenSha256Next = normalized(PREFIX + ".scrape-token-sha256-next", scrapeTokenSha256Next);
	}

	/** The configured digests, the empty list when neither slot is set. */
	List<byte[]> acceptedHashes() {
		List<byte[]> hashes = new ArrayList<>(2);
		for (String hex : new String[] { scrapeTokenSha256, scrapeTokenSha256Next }) {
			if (hex != null) {
				hashes.add(HexFormat.of().parseHex(hex));
			}
		}
		return List.copyOf(hashes);
	}

	private static String normalized(String property, String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		String hex = value.strip().toLowerCase(Locale.ROOT);
		if (!HEX_SHA256.matcher(hex).matches()) {
			throw new IllegalArgumentException(property
					+ " must be the SHA-256 of the scrape token as 64 hex characters, never the token itself");
		}
		return hex;
	}
}
