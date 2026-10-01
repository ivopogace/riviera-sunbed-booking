package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/**
 * Generates the Spring Modulith documentation (C4 component PlantUML diagrams + per-module canvases, their
 * Javadoc from {@code spring-modulith-apt}) from the live module structure into {@code build/spring-modulith-docs},
 * which CI uploads as the {@code modulith-docs} artifact. Pure structural analysis: no Spring context, no DB.
 */
class DocumentationTests {

	@Test
	void generateModulithDocs() {
		new Documenter(ApplicationModules.of(PlatformApplication.class)).writeDocumentation();
	}
}
