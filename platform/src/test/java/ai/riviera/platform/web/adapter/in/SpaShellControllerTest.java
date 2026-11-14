package ai.riviera.platform.web.adapter.in;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.WebSliceStubs;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.Beach;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueLinkPreview;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@link SpaShellController} over the web slice (stub shells under {@code src/test/resources/static/}): which
 * route gets which head, in which locale's shell, and that a backend segment never gets the shell.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = {"app.web.cors.allowed-origins=https://ivopogace.github.io",
		"riviera.web.public-origin=https://riviera.example"})
class SpaShellControllerTest {

	private static final String NOINDEX = "<meta name=\"robots\" content=\"noindex\">";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	VenueCatalog catalog;

	@Test
	void homeGetsGenericTagsPerLocale() throws Exception {
		mvc.perform(get("/"))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
				.andExpect(header().string("Cache-Control", "no-cache"))
				.andExpect(content().string(allOf(containsString("lang=\"en\""),
						containsString("<title>Riviera — Sunbed Booking</title>"),
						containsString("<link rel=\"canonical\" href=\"https://riviera.example/\">"),
						containsString("hreflang=\"x-default\" href=\"https://riviera.example/\""),
						not(containsString("<title>Riviera</title>")), not(containsString(NOINDEX)))));
		mvc.perform(get("/sq/"))
				.andExpect(content().string(allOf(containsString("lang=\"sq\""),
						containsString("<title>Riviera — Rezervim shezlongësh</title>"),
						containsString("<link rel=\"canonical\" href=\"https://riviera.example/sq/\">"))));
		mvc.perform(get("/it/"))
				.andExpect(content().string(containsString("<link rel=\"canonical\" href=\"https://riviera.example/it/\">")));
	}

	@Test
	void venuePageGetsTheVenuesTagsInTheLocalesShell() throws Exception {
		given(catalog.findLinkPreview(new VenueId(12))).willReturn(Optional.of(
				new VenueLinkPreview("Miramar", Beach.KSAMIL, "Calm bay.", "/api/venues/12/photos/ab")));

		mvc.perform(get("/it/venues/12").queryParam("date", "2026-07-01"))
				.andExpect(status().isOk())
				.andExpect(content().string(allOf(containsString("lang=\"it\""),
						containsString("<title>Miramar, Ksamil — Riviera</title>"),
						containsString("<meta property=\"og:image\" content=\"https://riviera.example/api/venues/12/photos/ab\">"),
						containsString("<link rel=\"canonical\" href=\"https://riviera.example/it/venues/12\">"),
						containsString("hreflang=\"sq\" href=\"https://riviera.example/sq/venues/12\""),
						not(containsString("date=")))));
	}

	@Test
	void unknownAndMalformedIdsGetGenericTags() throws Exception {
		given(catalog.findLinkPreview(any())).willReturn(Optional.empty());

		for (String path : new String[] {"/venues/404", "/venues/abc", "/sq/venues/0"}) {
			mvc.perform(get(path))
					.andExpect(status().isOk())
					.andExpect(content().string(allOf(containsString(NOINDEX), not(containsString("canonical")))));
		}
	}

	@Test
	void privateRoutesAreNoindex() throws Exception {
		for (String path : new String[] {"/booking/RVA7K2QX", "/booking/confirmation", "/account/reset",
				"/operator/3/daily", "/admin", "/my-bookings", "/sq/booking/RVA7K2QX", "/it/account/sign-in"}) {
			mvc.perform(get(path))
					.andExpect(status().isOk())
					.andExpect(content().string(allOf(containsString(NOINDEX), containsString("<title>Riviera</title>"),
							not(containsString("og:")), not(containsString("canonical")),
							not(containsString("RVA7K2QX")))));
		}
		mvc.perform(get("/sq/booking/RVA7K2QX")).andExpect(content().string(containsString("lang=\"sq\"")));
	}

	@Test
	void unknownLocaleSegmentAnswersTheSourceLocale() throws Exception {
		mvc.perform(get("/xx/venues/1")).andExpect(status().isOk())
				.andExpect(content().string(containsString("lang=\"en\"")));
	}

	@Test
	void apiPathsKeepTheirOwnAnswersPastTheApiChain() throws Exception {
		// An admin passes the API chain; an unmapped GET stays the NOT_FOUND problem, a POST-only path a 405.
		mvc.perform(get("/api/admin/no-such-thing").with(user("admin").roles("ADMIN")))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
		mvc.perform(get("/api/admin/erasure").with(user("admin").roles("ADMIN")))
				.andExpect(status().isMethodNotAllowed());
	}

	@Test
	void aPrivateRouteNamingVenuesStaysPrivate() throws Exception {
		given(catalog.findLinkPreview(new VenueId(1))).willReturn(Optional.of(
				new VenueLinkPreview("Miramar", Beach.KSAMIL, "Calm bay.", null)));

		mvc.perform(get("/admin/venues/1"))
				.andExpect(content().string(allOf(containsString(NOINDEX), not(containsString("Miramar")))));
	}

	@Test
	void everyRobotsDisallowedSpaRouteIsNoindex() throws Exception {
		for (String path : RobotsTxt.PRIVATE_SPA_PATHS) {
			for (String served : new String[] {path, path + "/x", "/sq" + path + "/x"}) {
				mvc.perform(get(served)).andExpect(content().string(containsString(NOINDEX)));
			}
		}
	}
}
