package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/**
 * Generates the Spring Modulith documentation (C4 component PlantUML diagrams + per-module
 * canvases) from the live module structure. Pure structural analysis — no Spring context, no
 * DB — so it runs anywhere. Output lands in {@code build/spring-modulith-docs}.
 */
class DocumentationTests {

	@Test
	void generateModulithDocs() {
		ApplicationModules modules = ApplicationModules.of(PlatformApplication.class);

		// Writes component PlantUML (all + per-module) and per-module canvases to the default
		// output folder (target/spring-modulith-docs).
		new Documenter(modules).writeDocumentation();
	}
}
