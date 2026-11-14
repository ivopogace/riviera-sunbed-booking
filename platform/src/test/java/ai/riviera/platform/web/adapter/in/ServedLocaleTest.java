package ai.riviera.platform.web.adapter.in;

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
 * Pins {@link ServedLocale} to the locales the Angular build emits ({@code frontend/angular.json}, ADR-0030), the
 * source {@code SpaLocaleTest} pins the root's {@code SpaLocale} to, so the two lists cannot drift apart: a
 * sitemap naming a locale the server does not serve would point crawlers at the source locale's shell.
 */
class ServedLocaleTest {

	private static final Path ANGULAR_JSON = Path.of("..", "frontend", "angular.json");

	@Test
	void servedLocalesAreTheBuiltLocalesUnderTheirSubpaths() {
		JsonNode i18n = JsonMapper.builder().build().readTree(ANGULAR_JSON.toFile())
				.path("projects").path("frontend").path("i18n");
		Map<String, String> built = new LinkedHashMap<>();
		JsonNode source = i18n.path("sourceLocale");
		built.put(source.path("code").asString(), prefixOf(source.path("subPath").asString()));
		i18n.path("locales").properties().forEach(locale -> built.put(locale.getKey(),
				prefixOf(locale.getValue().path("subPath").asString(locale.getKey()))));

		Map<String, String> served = Arrays.stream(ServedLocale.values()).collect(Collectors.toMap(
				ServedLocale::code, ServedLocale::prefix, (a, b) -> a, LinkedHashMap::new));
		assertEquals(built, served);
	}

	@Test
	void theSourceLocaleSitsAtTheRootAndTheOthersUnderTheirPrefix() {
		assertEquals("/", ServedLocale.EN.pathOf("/"));
		assertEquals("/sq/", ServedLocale.SQ.pathOf("/"));
		assertEquals("/it/help", ServedLocale.IT.pathOf("/help"));
	}

	private static String prefixOf(String subPath) {
		return subPath.isEmpty() ? "" : "/" + subPath;
	}
}
