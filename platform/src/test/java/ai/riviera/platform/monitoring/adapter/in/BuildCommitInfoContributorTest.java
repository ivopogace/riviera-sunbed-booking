package ai.riviera.platform.monitoring.adapter.in;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.info.Info;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The public {@code /actuator/info} body is the commit id alone, and only when the configured value is one: the CD poll
 * compares it with the deployed SHA (#1632), and anything else would publish whatever the variable holds.
 */
class BuildCommitInfoContributorTest {

	private static final String SHA = "4d65eb8a1c0f9e2b3d4c5a6b7e8f9012a3b4c5d6";

	@Test
	void publishesAFullCommitIdUnderCommit() {
		assertEquals(Map.of("commit", SHA), contributed(SHA));
	}

	@Test
	void stripsSurroundingWhitespace() {
		assertEquals(Map.of("commit", SHA), contributed("  " + SHA + "\n"));
	}

	@Test
	void publishesNothingWhenUnset() {
		assertEquals(Map.of(), contributed(""));
	}

	@Test
	void publishesNothingThatIsNotACommitId() {
		for (String value : new String[] { "main", "abc12", SHA.toUpperCase(), SHA + "-dirty", "g" + SHA.substring(1),
				"a".repeat(65), "user@host" }) {
			assertEquals(Map.of(), contributed(value), value);
		}
	}

	private static Map<String, Object> contributed(String configured) {
		Info.Builder builder = new Info.Builder();
		new BuildCommitInfoContributor(configured).contribute(builder);
		return builder.build().getDetails();
	}
}
