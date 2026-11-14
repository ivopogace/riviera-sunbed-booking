package ai.riviera.platform.web.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.WebSliceStubs;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The crawl policy as a non-production host configures it, bound through Spring: no public origin and
 * {@code riviera.web.robots.disallow-all=true}. robots.txt shuts every crawler out, and the sitemap is the
 * {@code NOT_FOUND} problem body every other 404 here carries (RESPONSIBILITIES.md §web).
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = { "riviera.web.public-origin=", "riviera.web.robots.disallow-all=true" })
class CrawlerNonProductionTest {

	@Autowired
	MockMvc mvc;

	@Test
	void robotsDisallowsEverything() throws Exception {
		mvc.perform(get(CrawlerController.ROBOTS_PATH))
				.andExpect(status().isOk())
				.andExpect(content().string("User-agent: *\nDisallow: /\n"));
	}

	@Test
	void withoutAnOriginTheSitemapIsTheNotFoundProblem() throws Exception {
		mvc.perform(get(CrawlerController.SITEMAP_PATH))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}
}
