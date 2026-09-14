package ai.riviera.platform;

import java.nio.file.Path;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves the riviera map's resources — the style, the PMTiles archive, the glyph ranges and the
 * sprites — same-origin under {@code /map/**} from the directory {@code riviera.map.dir}
 * ({@code map/} next to the jar: {@code platform/map/} under {@code bootRun}, {@code /app/map/} on
 * the image). Anonymous like the SPA shell; the archive is read by HTTP {@code Range}, which the
 * framework's resource handler answers with a {@code 206} slice.
 *
 * <p>A file-system directory rather than the classpath on purpose: a jar entry is deflated, so
 * seeking to a byte offset means inflating everything before it, on every tile request. An
 * app-wide web concern like {@link SpaWebConfig}, so it lives in the root package, not in a
 * module (invariant #11). Rationale: RESPONSIBILITIES.md § <em>Platform edge</em>, ADR-0022.
 */
@Component
class MapResourcesConfig implements WebMvcConfigurer {

	static final String MAP_PATH_PATTERN = "/map/**";
	/** Tiles change only when the extract is regenerated, so an hour of staleness is harmless. */
	private static final CacheControl CACHE = CacheControl.maxAge(Duration.ofHours(1)).cachePublic();

	private final String location;

	MapResourcesConfig(@Value("${riviera.map.dir}") String dir) {
		this.location = Path.of(dir).toAbsolutePath().normalize().toUri().toString();
	}

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler(MAP_PATH_PATTERN)
				.addResourceLocations(location)
				.setCacheControl(CACHE);
	}
}
