package ai.riviera.platform.web.adapter.in;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import ai.riviera.platform.venue.api.PublicVenueIndex;

/**
 * The crawl policy: {@code /robots.txt} and {@code /sitemap.xml}, anonymous and read-only (the SPA chain in
 * {@code SecurityConfig}). Absolute URLs come from {@link PublicWebProperties}, never the request's {@code Host};
 * without a configured origin the sitemap is the {@code NOT_FOUND} problem and robots.txt names none. Rationale:
 * {@code RESPONSIBILITIES.md} §{@code web}.
 */
@RestController
@EnableConfigurationProperties(PublicWebProperties.class)
class CrawlerController {

	static final String ROBOTS_PATH = "/robots.txt";
	static final String SITEMAP_PATH = "/sitemap.xml";

	private static final CacheControl CACHE = CacheControl.maxAge(Duration.ofHours(1)).cachePublic();
	private static final MediaType TEXT_UTF8 = new MediaType(MediaType.TEXT_PLAIN, StandardCharsets.UTF_8);
	private static final MediaType XML_UTF8 = new MediaType(MediaType.APPLICATION_XML, StandardCharsets.UTF_8);

	private final PublicWebProperties properties;
	private final PublicVenueIndex venues;

	CrawlerController(PublicWebProperties properties, PublicVenueIndex venues) {
		this.properties = properties;
		this.venues = venues;
	}

	@GetMapping(ROBOTS_PATH)
	ResponseEntity<String> robots() {
		String sitemapUrl = properties.absolute(SITEMAP_PATH).orElse(null);
		return ResponseEntity.ok().cacheControl(CACHE).contentType(TEXT_UTF8)
				.body(RobotsTxt.render(sitemapUrl, properties.robots().disallowAll()));
	}

	@GetMapping(SITEMAP_PATH)
	ResponseEntity<String> sitemap() {
		return properties.origin()
				.map(origin -> ResponseEntity.ok().cacheControl(CACHE).contentType(XML_UTF8)
						.body(SitemapXml.render(origin, venues.visibleVenueIds())))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}
}
