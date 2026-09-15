package ai.riviera.platform;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The shipped map style must name only our own origin (ADR-0022): every source URL, tile
 * template, the glyph template and the sprite base are {@code /map/…} paths, optionally behind the
 * {@code pmtiles://} scheme. This is the review trap's lock — one pasted CDN glyph URL would send
 * every visitor's IP to a third party — so it reads the committed file, not a fixture.
 */
class MapStyleSelfHostedTest {

	/** Gradle runs tests from {@code platform/}, where the served directory lives. */
	private static final Path STYLE = Path.of("map", "style.json");
	private static final String OUR_PREFIX = "/map/";
	private static final String PMTILES_SCHEME = "pmtiles://";

	@Test
	void everyStyleUrlStaysOnOurOrigin() throws IOException {
		assertTrue(Files.exists(STYLE), "missing " + STYLE.toAbsolutePath() + " — run scripts/build-riviera-map.sh --assets");
		JsonNode style = new ObjectMapper().readTree(Files.readString(STYLE));

		List<String> urls = new ArrayList<>();
		style.path("sources").properties().forEach(source -> {
			JsonNode node = source.getValue();
			if (node.hasNonNull("url")) {
				urls.add(node.get("url").asText());
			}
			node.path("tiles").forEach(tile -> urls.add(tile.asText()));
		});
		urls.add(style.path("glyphs").asText());
		JsonNode sprite = style.path("sprite");
		if (sprite.isArray()) {
			sprite.forEach(entry -> urls.add(entry.path("url").asText()));
		} else {
			urls.add(sprite.asText());
		}

		assertFalse(urls.isEmpty(), "the style names no resource at all");
		for (String url : urls) {
			String path = url.startsWith(PMTILES_SCHEME) ? url.substring(PMTILES_SCHEME.length()) : url;
			assertTrue(path.startsWith(OUR_PREFIX) && !path.contains("://"),
					"not a same-origin /map/ path: " + url);
		}
	}

	@Test
	void everyLayerReadsOurOneVectorSource() throws IOException {
		JsonNode style = new ObjectMapper().readTree(Files.readString(STYLE));
		assertEquals(1, style.path("sources").size(), "exactly one source: the PMTiles archive");
		String source = style.path("sources").propertyNames().iterator().next();
		style.path("layers").forEach(layer -> {
			if (!"background".equals(layer.path("type").asText())) {
				assertEquals(source, layer.path("source").asText(), "layer " + layer.path("id").asText());
			}
		});
	}
}
