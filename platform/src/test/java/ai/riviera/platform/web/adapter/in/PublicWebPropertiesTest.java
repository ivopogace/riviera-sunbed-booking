package ai.riviera.platform.web.adapter.in;

import java.util.Optional;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * {@link PublicWebProperties}: a blank origin is none, a bare https origin (or a bare http one on a loopback host) is
 * kept, anything else aborts the boot.
 */
class PublicWebPropertiesTest {

	private static PublicWebProperties withOrigin(String origin) {
		return new PublicWebProperties(origin, new PublicWebProperties.Robots(false));
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "   " })
	void blankMeansNoOrigin(String origin) {
		assertEquals(Optional.empty(), withOrigin(origin).origin());
	}

	@ParameterizedTest
	@ValueSource(strings = { "https://riviera.example", "https://riviera.example/", " https://riviera.example ",
			"HTTPS://riviera.example" })
	void aBareHttpsOriginIsKeptInItsCanonicalForm(String origin) {
		assertEquals(Optional.of("https://riviera.example"), withOrigin(origin).origin());
	}

	@Test
	void aPortIsPartOfTheOrigin() {
		assertEquals(Optional.of("https://riviera.example:8443"), withOrigin("https://riviera.example:8443").origin());
	}

	@ParameterizedTest
	@ValueSource(strings = { "http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080" })
	void aBareHttpOriginOnALoopbackHostIsKept(String origin) {
		assertEquals(Optional.of(origin), withOrigin(origin + "/").origin());
	}

	@ParameterizedTest
	@ValueSource(strings = { "http://riviera.example", "http://localhost.riviera.example", "http://127.0.0.2",
			"http://localhost:8080/sq", "http://user@localhost", "riviera.example", "https://riviera.example/sq",
			"https://riviera.example//", "https://riviera.example?x=1", "https://riviera.example#top",
			"https://user@riviera.example", "https://riviera.example:", "https://", "https://riviera example", "ftp://riviera.example" })
	void anythingButABareHttpsOriginAbortsTheBoot(String origin) {
		assertThrows(IllegalArgumentException.class, () -> withOrigin(origin));
	}
}
