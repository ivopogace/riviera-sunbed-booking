package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/**
 * Verifies the Spring Modulith structure (invariant #11): the six bounded-context
 * modules and their boundaries. Pure structural analysis — no Spring context, no
 * database — so it runs anywhere, including without Docker.
 */
class ModularityTests {

	static final ApplicationModules modules = ApplicationModules.of(PlatformApplication.class);

	@Test
	void verifiesModularStructure() {
		modules.verify();
	}
}
