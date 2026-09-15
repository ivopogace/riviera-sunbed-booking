package ai.riviera.platform;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The {@code dev} profile runs from the repository root, so every relative path it resolves is
 * written from there: the Compose file already is, and the map directory must agree or
 * {@code /map/**} answers 404 on a local stack. Reads the properties files directly — no Spring
 * context, no Docker Compose.
 */
class DevProfileWorkingDirectoryTest {

	/** Gradle runs tests from {@code platform/}, so the repository root is its parent. */
	private static final Path REPO_ROOT = Path.of("").toAbsolutePath().getParent();

	@Test
	void theComposeFileAndTheMapDirectoryResolveFromTheRepositoryRoot() throws IOException {
		Properties dev = devProfile();
		String composeFile = dev.getProperty("spring.docker.compose.file");
		String mapDir = dev.getProperty("riviera.map.dir");

		assertTrue(Files.isRegularFile(REPO_ROOT.resolve(composeFile)), "compose file " + composeFile);
		assertTrue(Files.isRegularFile(REPO_ROOT.resolve(mapDir).resolve("style.json")), "map dir " + mapDir);
	}

	/** The dev file layered over the base file, as Spring resolves a key under the {@code dev} profile. */
	private static Properties devProfile() throws IOException {
		Properties dev = new Properties(PropertiesLoaderUtils.loadProperties(new ClassPathResource("application.properties")));
		dev.putAll(PropertiesLoaderUtils.loadProperties(new ClassPathResource("application-dev.properties")));
		return dev;
	}
}
