package ai.riviera.platform;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Generates the Spring Modulith documentation (C4 component PlantUML diagrams + per-module canvases, their
 * Javadoc from {@code spring-modulith-apt}) from the live module structure into {@code build/spring-modulith-docs},
 * which CI uploads as the {@code modulith-docs} artifact. Pure structural analysis: no Spring context, no DB.
 */
class DocumentationTests {

	/** Where {@code spring-modulith-apt} writes the Javadoc the canvases read; absent, they carry none. */
	private static final Path APT_JAVADOC = Path.of("build/generated-spring-modulith/javadoc.json");

	@Test
	void generateModulithDocs() {
		assertTrue(Files.isRegularFile(APT_JAVADOC),
				"spring-modulith-apt did not run: it must be on build.gradle's annotationProcessor configuration");

		new Documenter(ApplicationModules.of(PlatformApplication.class)).writeDocumentation();
	}
}
