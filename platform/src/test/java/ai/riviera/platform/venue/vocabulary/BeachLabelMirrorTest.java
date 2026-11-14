package ai.riviera.platform.venue.vocabulary;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Pins {@link Beach}'s codes, order and display labels to the frontend mirror
 * ({@code frontend/src/app/shared/beaches.ts}'s {@code BEACH_CATALOGUE}): the served link preview and
 * the SPA's venue title must name a beach the same way.
 */
class BeachLabelMirrorTest {

	private static final Path BEACHES_TS = Path.of("..", "frontend", "src", "app", "shared", "beaches.ts");
	private static final Pattern ENTRY = Pattern.compile("beach\\('([A-Z_]+)',\\s*'([^']+)'");

	@Test
	void labelsMatchTheFrontendCatalogueInOrder() throws IOException {
		Matcher entries = ENTRY.matcher(Files.readString(BEACHES_TS, StandardCharsets.UTF_8));
		Map<String, String> mirrored = new LinkedHashMap<>();
		while (entries.find()) {
			mirrored.put(entries.group(1), entries.group(2));
		}

		Map<String, String> backend = Arrays.stream(Beach.values()).collect(Collectors.toMap(
				Beach::name, Beach::label, (a, b) -> a, LinkedHashMap::new));
		assertEquals(String.join(",", mirrored.keySet()), String.join(",", backend.keySet()));
		assertEquals(mirrored, backend);
	}
}
