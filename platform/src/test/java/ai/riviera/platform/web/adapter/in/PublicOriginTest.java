package ai.riviera.platform.web.adapter.in;

import java.util.Optional;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** {@link PublicOrigin}: absolute URLs from the configured origin alone, none when unset, a bad value refused. */
class PublicOriginTest {

	@Test
	void blankOriginBuildsNoAbsoluteUrl() {
		assertEquals(Optional.empty(), new PublicOrigin("").absolute("/venues/1"));
		assertEquals(Optional.empty(), new PublicOrigin("  ").absolute("/"));
	}

	@Test
	void configuredOriginPrefixesThePath() {
		assertEquals(Optional.of("https://riviera.example/venues/1"),
				new PublicOrigin("https://riviera.example").absolute("/venues/1"));
		assertEquals(Optional.of("https://riviera.example/"),
				new PublicOrigin(" https://riviera.example/ ").absolute("/"));
		assertEquals(Optional.of("http://localhost:8080/sq/"),
				new PublicOrigin("http://localhost:8080").absolute("/sq/"));
	}

	@ParameterizedTest
	@ValueSource(strings = {"riviera.example", "ftp://riviera.example", "https://riviera.example/app",
			"https://riviera.example?x=1", "https://riviera.example#top", "https://user@riviera.example",
			"https://", "not a url"})
	void malformedOriginIsRefusedAtStartup(String configured) {
		IllegalStateException refused = assertThrows(IllegalStateException.class, () -> new PublicOrigin(configured));
		assertEquals(true, refused.getMessage().contains("riviera.web.public-origin"));
	}
}
