package ai.riviera.platform;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The served location is a directory URL whether or not the directory exists yet: a fresh
 * checkout boots before {@code scripts/build-riviera-map.sh} has run, and a location without its
 * trailing slash would resolve every map path one level up.
 */
class MapResourcesConfigTest {

	@Test
	void locationEndsWithASlashEvenWhenTheDirectoryDoesNotExistYet(@TempDir Path tmp) {
		String location = MapResourcesConfig.resourceLocation(tmp.resolve("not-yet-built").toString());

		assertTrue(location.startsWith("file:"), location);
		assertTrue(location.endsWith("/not-yet-built/"), location);
	}

	@Test
	void locationOfAnExistingDirectoryIsTheSameShape(@TempDir Path tmp) {
		assertEquals(tmp.toUri().toString(), MapResourcesConfig.resourceLocation(tmp.toString()));
	}
}
