package ai.riviera.platform;

import java.nio.file.Path;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves the riviera map's style, PMTiles archive, glyph ranges and sprites, anonymous and
 * same-origin under {@code /map/**}, from the directory {@code riviera.map.dir} ({@code map/} next
 * to the jar: {@code platform/map/} under {@code bootRun}, {@code /app/map/} on the image). The
 * archive is read by HTTP {@code Range} (a {@code 206} slice), so a file-system directory, not the
 * classpath: a jar entry cannot seek. App-wide like {@link SpaWebConfig}, so root package (#11).
 * Rationale: RESPONSIBILITIES.md § <em>Platform edge</em>, ADR-0022.
 */
@Component
class MapResourcesConfig implements WebMvcConfigurer {

	static final String MAP_PATH_PATTERN = "/map/**";
	/** Tiles change only when the extract is regenerated, so an hour of staleness is harmless. */
	private static final CacheControl CACHE = CacheControl.maxAge(Duration.ofHours(1)).cachePublic();

	private final String location;

	MapResourcesConfig(@Value("${riviera.map.dir}") String dir) {
		this.location = resourceLocation(dir);
	}

	/** The directory as a resource location; the trailing slash is added by hand because {@code toUri} adds it only for a directory that already exists. */
	static String resourceLocation(String dir) {
		String uri = Path.of(dir).toAbsolutePath().normalize().toUri().toString();
		return uri.endsWith("/") ? uri : uri + "/";
	}

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler(MAP_PATH_PATTERN)
				.addResourceLocations(location)
				.setCacheControl(CACHE);
	}
}
