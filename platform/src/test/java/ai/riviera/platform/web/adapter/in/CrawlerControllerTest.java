package ai.riviera.platform.web.adapter.in;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** {@link CrawlerController}'s two documents across the origin and disallow-all configurations. */
class CrawlerControllerTest {

	private static final String ORIGIN = "https://riviera.example";

	private static CrawlerController controller(String origin, boolean disallowAll) {
		return new CrawlerController(new PublicWebProperties(origin, new PublicWebProperties.Robots(disallowAll)),
				() -> List.of(new VenueId(7)));
	}

	@Test
	void robotsDisallowsEveryPrivateSurfaceInEveryLocaleAndNamesTheSitemap() {
		ResponseEntity<String> response = controller(ORIGIN, false).robots();

		assertEquals(HttpStatus.OK, response.getStatusCode());
		assertTrue(MediaType.TEXT_PLAIN.isCompatibleWith(response.getHeaders().getContentType()));
		String body = response.getBody();
		assertNotNull(body);
		List<String> lines = body.lines().toList();
		assertEquals("User-agent: *", lines.getFirst());
		for (String path : List.of("/operator", "/admin", "/account", "/booking", "/my-bookings", "/venue-admin")) {
			for (String prefix : List.of("", "/sq", "/it")) {
				assertTrue(lines.contains("Disallow: " + prefix + path), prefix + path);
			}
		}
		assertTrue(lines.contains("Disallow: /api"));
		assertFalse(lines.contains("Disallow: /"), "the tourist pages stay crawlable");
		assertEquals("Sitemap: " + ORIGIN + "/sitemap.xml", lines.getLast());
	}

	@Test
	void disallowAllShutsEveryCrawlerOut() {
		String body = controller(ORIGIN, true).robots().getBody();

		assertEquals("User-agent: *\nDisallow: /\n", body);
	}

	@Test
	void withoutAnOriginRobotsNamesNoSitemapAndTheSitemapIsNotFound() {
		CrawlerController controller = controller("", false);

		String robots = controller.robots().getBody();
		assertNotNull(robots);
		assertFalse(robots.contains("Sitemap:"));
		assertTrue(robots.contains("Disallow: /booking\n"));
		assertEquals(HttpStatus.NOT_FOUND, controller.sitemap().getStatusCode());
	}

	@Test
	void theSitemapIsXmlOnTheConfiguredOriginAndCacheable() {
		ResponseEntity<String> response = controller(ORIGIN, false).sitemap();

		assertEquals(HttpStatus.OK, response.getStatusCode());
		assertTrue(MediaType.APPLICATION_XML.isCompatibleWith(response.getHeaders().getContentType()));
		assertEquals("max-age=3600, public", response.getHeaders().getCacheControl());
		String body = response.getBody();
		assertNotNull(body);
		assertTrue(body.contains("<loc>" + ORIGIN + "/venues/7</loc>"));
	}
}
