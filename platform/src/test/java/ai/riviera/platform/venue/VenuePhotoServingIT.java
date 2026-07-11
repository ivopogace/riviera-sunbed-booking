package ai.riviera.platform.venue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.application.PhotoStorage;
import ai.riviera.platform.venue.application.ProcessedPhoto;
import ai.riviera.platform.venue.application.StoredVariant;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the public venue-photo serving endpoint ({@code GET /api/venues/{venueId}/photos/{hash}},
 * issue #142, AC-7) at the HTTP level: the bytes come back with the long-lived immutable cache
 * headers + a strong {@code ETag}, a matching {@code If-None-Match} short-circuits to {@code 304}
 * <em>without touching storage</em>, and the route is venue-scoped, hex-guarded, and public (no
 * session anywhere in this class). Photos are seeded through the real {@link PhotoStorage} adapter
 * against Testcontainers Postgres; skipped where Docker is absent (CI runs it).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class VenuePhotoServingIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	PhotoStorage storage;

	@Autowired
	JdbcClient jdbc;

	private VenueId newVenueWithCover(String hashHex, byte[] bytes) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Serving IT Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		VenueId venue = new VenueId(id);
		storage.replace(venue, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				new StoredVariant(PhotoSurface.CARD, new ContentHash(hashHex), "image/jpeg", 640, 384, bytes))));
		return venue;
	}

	@Test
	void servesBytesWithImmutableCacheAndStrongEtag() throws Exception {
		// AC-7 happy path — and public by construction: no session cookie is sent anywhere here.
		byte[] payload = {21, 42, 63, 84};
		VenueId venue = newVenueWithCover("a11a01", payload);

		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), "a11a01"))
				.andExpect(status().isOk())
				.andExpect(content().contentType(MediaType.IMAGE_JPEG))
				.andExpect(content().bytes(payload))
				.andExpect(header().string(HttpHeaders.ETAG, "\"a11a01\""))
				.andExpect(header().string(HttpHeaders.CACHE_CONTROL, allOf(
						containsString("max-age=31536000"),
						containsString("public"),
						containsString("immutable"))));
	}

	@Test
	void matchingIfNoneMatchIs304WithoutABlobRead() throws Exception {
		// AC-7 conditional path. The second half is the "without a blob read" proof: after the
		// photo rows are deleted outright, a matching If-None-Match STILL returns 304 — the
		// content-addressed URL is immutable, so the revalidation never needs storage.
		VenueId venue = newVenueWithCover("b22b02", new byte[] {1, 2, 3});

		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), "b22b02")
						.header(HttpHeaders.IF_NONE_MATCH, "\"b22b02\""))
				.andExpect(status().isNotModified())
				.andExpect(header().string(HttpHeaders.ETAG, "\"b22b02\""))
				.andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("immutable")));

		jdbc.sql("DELETE FROM venue_photo WHERE venue_id = :v").param("v", venue.value()).update();

		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), "b22b02")
						.header(HttpHeaders.IF_NONE_MATCH, "\"b22b02\""))
				.andExpect(status().isNotModified());
	}

	@Test
	void unknownHashIs404() throws Exception {
		VenueId venue = newVenueWithCover("c33c03", new byte[] {7});

		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), "deadbeef"))
				.andExpect(status().isNotFound());
	}

	@Test
	void nonHexHashIs404WithoutALookup() throws Exception {
		// The ContentHash hex guard rejects at the edge (path-traversal / SSRF safety): anything
		// but lower-case hex can never name a variant, so it 404s before any storage call.
		mvc.perform(get("/api/venues/{v}/photos/{h}", 1L, "NOT-A-HASH"))
				.andExpect(status().isNotFound());
	}

	@Test
	void servingIsVenueScoped() throws Exception {
		// The hash exists — but under a different venue: the venue-addressed route must not
		// serve another venue's bytes, so the mismatched pair is a 404.
		VenueId owner = newVenueWithCover("d44d04", new byte[] {5, 5});

		mvc.perform(get("/api/venues/{v}/photos/{h}", owner.value() + 999, "d44d04"))
				.andExpect(status().isNotFound());
	}
}
