package ai.riviera.platform;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The riviera map's four resources are served same-origin under {@code /map/**} from a
 * file-system directory ({@link MapResourcesConfig}), anonymous like the SPA shell. The archive
 * is read by byte range, so the seam this pins is the {@code Range} answer: a {@code 206} carrying
 * exactly the requested slice. The directory is a temp dir holding a 64-byte stand-in archive and a
 * one-line style, so the slice runs without the real extract and without Testcontainers.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, SpaWebConfig.class, MapResourcesConfig.class,
		WebSliceStubs.class})
@TestPropertySource(properties = "app.web.cors.allowed-origins=https://ivopogace.github.io")
class MapResourcesTest {

	private static final byte[] ARCHIVE = archiveBytes();
	private static final String STYLE = "{\"version\":8}";
	private static final Path MAP_DIR = writeFixture();

	@Autowired
	MockMvc mvc;

	@DynamicPropertySource
	static void mapDir(DynamicPropertyRegistry registry) {
		registry.add("riviera.map.dir", MAP_DIR::toString);
	}

	@Test
	void rangeRequestIsAnsweredWithTheByteSlice() throws Exception {
		byte[] body = mvc.perform(get("/map/riviera.pmtiles").header(HttpHeaders.RANGE, "bytes=10-19"))
				.andExpect(status().isPartialContent())
				.andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes 10-19/64"))
				.andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
				.andReturn().getResponse().getContentAsByteArray();

		assertArrayEquals(Arrays.copyOfRange(ARCHIVE, 10, 20), body);
	}

	@Test
	void wholeArchiveIsServedOnAPlainGet() throws Exception {
		byte[] body = mvc.perform(get("/map/riviera.pmtiles"))
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
				.andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=3600, public"))
				.andReturn().getResponse().getContentAsByteArray();

		assertArrayEquals(ARCHIVE, body);
	}

	@Test
	void styleIsServedAsJson() throws Exception {
		mvc.perform(get("/map/style.json"))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(content().string(STYLE));
	}

	@Test
	void missingMapPathIs404NotTheShell() throws Exception {
		mvc.perform(get("/map/gone.json")).andExpect(status().isNotFound());
		// Extensionless too: nothing under /map/ is a client route, so no SPA fallback applies.
		mvc.perform(get("/map/ghost")).andExpect(status().isNotFound());
	}

	@Test
	void mapPathsArePublicToAnonymous() throws Exception {
		mvc.perform(get("/map/style.json")).andExpect(status().isOk());
	}

	private static byte[] archiveBytes() {
		byte[] bytes = new byte[64];
		for (int i = 0; i < bytes.length; i++) {
			bytes[i] = (byte) i;
		}
		return bytes;
	}

	private static Path writeFixture() {
		try {
			Path dir = Files.createTempDirectory("riviera-map-test");
			Files.write(dir.resolve("riviera.pmtiles"), ARCHIVE);
			Files.writeString(dir.resolve("style.json"), STYLE, StandardCharsets.UTF_8);
			return dir;
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}
}
