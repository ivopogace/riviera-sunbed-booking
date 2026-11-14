package ai.riviera.platform;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Pins {@link SpaLocale} to the locales the Angular build emits ({@code frontend/angular.json}'s
 * {@code i18n} block, ADR-0030): a locale built but not served would answer its deep links with the
 * source locale's shell, and one served but not built would answer with nothing.
 */
class SpaLocaleTest {

	private static final Path ANGULAR_JSON = Path.of("..", "frontend", "angular.json");

	@Test
	void servedLocalesAreTheBuiltLocalesUnderTheirSubpaths() {
		JsonNode i18n = JsonMapper.builder().build().readTree(ANGULAR_JSON.toFile())
				.path("projects").path("frontend").path("i18n");
		Map<String, String> built = new LinkedHashMap<>();
		JsonNode source = i18n.path("sourceLocale");
		built.put(source.path("code").asString(), source.path("subPath").asString());
		i18n.path("locales").properties().forEach(locale -> built.put(locale.getKey(),
				locale.getValue().path("subPath").asString(locale.getKey())));

		Map<String, String> served = Arrays.stream(SpaLocale.values()).collect(Collectors.toMap(
				SpaLocale::code, SpaLocale::subPath, (a, b) -> a, LinkedHashMap::new));
		assertEquals(built, served);
	}
}
