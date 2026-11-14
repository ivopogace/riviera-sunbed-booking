package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The crawl policy over the real chain and schema (#1761): {@code /robots.txt} and {@code /sitemap.xml} answer
 * anonymously, robots.txt keeps crawlers off the private surfaces and names the sitemap on the configured origin,
 * and the sitemap lists a venue only while its owner is {@code ACTIVE} ({@code VenueVisibility}).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class CrawlSurfaceIT {

	private static final String ORIGIN = SharedTestProperties.PUBLIC_ORIGIN;

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	private final List<Long> operators = new ArrayList<>();
	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		if (!venues.isEmpty()) {
			jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN (:ids)").param("ids", venues).update();
			jdbc.sql("DELETE FROM venue WHERE id IN (:ids)").param("ids", venues).update();
		}
		if (!operators.isEmpty()) {
			jdbc.sql("DELETE FROM operator WHERE id IN (:ids)").param("ids", operators).update();
		}
	}

	@Test
	void robotsDisallowsPrivateSurfacesAndNamesTheSitemap() throws Exception {
		mvc.perform(get("/robots.txt"))
				.andExpect(status().isOk())
				.andExpect(header().string("Content-Type", startsWith("text/plain")))
				.andExpect(content().string(startsWith("User-agent: *\n")))
				.andExpect(content().string(containsString("Disallow: /booking\n")))
				.andExpect(content().string(containsString("Disallow: /sq/account\n")))
				.andExpect(content().string(containsString("Disallow: /api\n")))
				.andExpect(content().string(not(containsString("Disallow: /\n"))))
				.andExpect(content().string(containsString("Sitemap: " + ORIGIN + "/sitemap.xml\n")));
	}

	@Test
	void sitemapListsVisibleVenuesOnly() throws Exception {
		long visible = ownedVenue("crawl-active", "ACTIVE");
		long pending = ownedVenue("crawl-pending", "PENDING");
		long suspended = ownedVenue("crawl-suspended", "SUSPENDED");
		long orphan = venue("crawl-orphan venue");

		mvc.perform(get("/sitemap.xml"))
				.andExpect(status().isOk())
				.andExpect(header().string("Content-Type", startsWith("application/xml")))
				.andExpect(header().string("Cache-Control", "max-age=3600, public"))
				.andExpect(content().string(containsString(
						"<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"")))
				.andExpect(content().string(containsString("<loc>" + ORIGIN + "/</loc>")))
				.andExpect(content().string(containsString("<loc>" + ORIGIN + "/sq/help</loc>")))
				.andExpect(content().string(containsString("<loc>" + ORIGIN + "/venues/" + visible + "</loc>")))
				.andExpect(content().string(containsString("<loc>" + ORIGIN + "/it/venues/" + visible + "</loc>")))
				.andExpect(content().string(not(containsString("/venues/" + pending + "<"))))
				.andExpect(content().string(not(containsString("/venues/" + suspended + "<"))))
				.andExpect(content().string(not(containsString("/venues/" + orphan + "<"))))
				.andExpect(content().string(not(containsString("/booking"))))
				.andExpect(content().string(not(containsString("<loc>http:"))))
				.andExpect(content().string(not(containsString("href=\"http:"))));
	}

	private long ownedVenue(String username, String status) {
		long owner = jdbc.sql("INSERT INTO operator (username, status) VALUES (:username, :status) RETURNING id")
				.param("username", username)
				.param("status", status)
				.query(Long.class)
				.single();
		operators.add(owner);
		long venue = venue(username + " venue");
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:venue, :operator)")
				.param("venue", venue)
				.param("operator", owner)
				.update();
		return venue;
	}

	private long venue(String name) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).query(Long.class).single();
		venues.add(id);
		return id;
	}
}
