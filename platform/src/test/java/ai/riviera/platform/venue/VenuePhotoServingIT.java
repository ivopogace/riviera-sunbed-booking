package ai.riviera.platform.venue;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.venue.application.PhotoStorage;
import ai.riviera.platform.venue.application.ProcessedPhoto;
import ai.riviera.platform.venue.application.StoredVariant;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the venue-photo serving endpoint ({@code GET /api/venues/{venueId}/photos/{hash}}) at the
 * HTTP level: the bytes come back with a <strong>revalidating</strong> cache directive + a strong
 * {@code ETag}, a matching {@code If-None-Match} short-circuits to {@code 304} <em>without a blob
 * read</em> while the variant exists but {@code 404}s once it is removed, and the route is
 * venue-scoped, hex-guarded, and public for a tourist-visible venue. A hidden venue's photo
 * (owner {@code PENDING}) is {@code 404} to everyone but its owner and an admin, who get it
 * {@code private} (#1335, ADR-0013). Photos are seeded through the real {@link PhotoStorage}
 * adapter against Testcontainers Postgres; skipped where Docker is absent (CI runs it).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class VenuePhotoServingIT {

	private static final String ADMIN = "operator"; // the bootstrap account, platform admin (V29)
	private static final String ADMIN_PW = "test-operator-pw";
	private static final String PENDING_OWNER = "serving-pending-owner";
	private static final String OTHER_OPERATOR = "serving-other-op";
	private static final String OPERATOR_PW = "serving-op-pw";
	private static final String SERVE_PATH = "/api/venues/{v}/photos/{h}";

	@Autowired
	MockMvc mvc;

	@Autowired
	PhotoStorage storage;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	OperatorProvisioning provisioning;

	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void provisionThePendingOwnerAndAnotherOperator() {
		for (String username : List.of(PENDING_OWNER, OTHER_OPERATOR)) {
			jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
					+ "(SELECT id FROM operator WHERE username = :u)").param("u", username).update();
			jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", username).update();
			provisioning.provision(username, encoder.encode(OPERATOR_PW));
		}
		jdbc.sql("UPDATE operator SET status = 'PENDING' WHERE username = :u").param("u", PENDING_OWNER).update();
	}

	/** A tourist-visible venue: owned by the always-{@code ACTIVE} bootstrap operator. */
	private VenueId newVenueWithCover(String hashHex, byte[] bytes) {
		VenueId venue = insertVenueWithCover(hashHex, bytes);
		OwnershipFixtures.grantToBootstrap(jdbc, venue.value());
		return venue;
	}

	/** A venue hidden from tourists: its owner is {@code PENDING}, awaiting admin approval. */
	private VenueId newHiddenVenueWithCover(String hashHex, byte[] bytes) {
		VenueId venue = insertVenueWithCover(hashHex, bytes);
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) SELECT :v, id FROM operator WHERE username = :u")
				.param("v", venue.value()).param("u", PENDING_OWNER).update();
		return venue;
	}

	private VenueId insertVenueWithCover(String hashHex, byte[] bytes) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Serving IT Venue', 'KSAMIL', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		VenueId venue = new VenueId(id);
		storage.replace(venue, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				new StoredVariant(PhotoSurface.CARD, 1, new ContentHash(hashHex), "image/jpeg", 640, 384, bytes))));
		return venue;
	}

	@Test
	void servesBytesWithRevalidatingCacheAndStrongEtag() throws Exception {
		// AC-7 happy path — and public by construction: no session cookie is sent anywhere here.
		// Still stored and reused via 304, but revalidated, so a takedown reaches shared caches.
		byte[] payload = {21, 42, 63, 84};
		VenueId venue = newVenueWithCover("a11a01", payload);

		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), "a11a01"))
				.andExpect(status().isOk())
				.andExpect(content().contentType(MediaType.IMAGE_JPEG))
				.andExpect(content().bytes(payload))
				.andExpect(header().string(HttpHeaders.ETAG, "\"a11a01\""))
				.andExpect(header().string(HttpHeaders.CACHE_CONTROL, allOf(
						containsString("no-cache"),
						containsString("public"),
						not(containsString("immutable")),
						not(containsString("max-age=31536000")))));
	}

	@Test
	void matchingIfNoneMatchIs304WhileTheVariantExists() throws Exception {
		// AC-7 conditional path: the revalidation costs an index probe, never a bytea read.
		VenueId venue = newVenueWithCover("b22b02", new byte[] {1, 2, 3});

		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), "b22b02")
						.header(HttpHeaders.IF_NONE_MATCH, "\"b22b02\""))
				.andExpect(status().isNotModified())
				.andExpect(header().string(HttpHeaders.ETAG, "\"b22b02\""))
				.andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-cache")));
	}

	@Test
	void revalidationAfterRemovalIs404() throws Exception {
		// Answered from the URL alone, this 304'd forever for any client holding the ETag.
		VenueId venue = newVenueWithCover("b22b03", new byte[] {1, 2, 3});

		jdbc.sql("DELETE FROM venue_photo WHERE venue_id = :v").param("v", venue.value()).update();

		mvc.perform(get("/api/venues/{v}/photos/{h}", venue.value(), "b22b03")
						.header(HttpHeaders.IF_NONE_MATCH, "\"b22b03\""))
				.andExpect(status().isNotFound());
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
		// The hash exists, but under another visible venue: the route never serves across venues.
		newVenueWithCover("d44d04", new byte[] {5, 5});
		VenueId other = newVenueWithCover("d44d05", new byte[] {6});

		mvc.perform(get(SERVE_PATH, other.value(), "d44d04"))
				.andExpect(status().isNotFound());
	}

	@Test
	void hiddenVenuePhotoIs404ToTheAnonymousCaller() throws Exception {
		VenueId hidden = newHiddenVenueWithCover("e55e01", new byte[] {1});

		mvc.perform(get(SERVE_PATH, hidden.value(), "e55e01"))
				.andExpect(status().isNotFound());
	}

	@Test
	void hiddenVenueRevalidationIs404() throws Exception {
		// The 304 path is fenced too, else a cached copy from before suspension revalidates forever.
		VenueId hidden = newHiddenVenueWithCover("e55e02", new byte[] {1});

		mvc.perform(get(SERVE_PATH, hidden.value(), "e55e02").header(HttpHeaders.IF_NONE_MATCH, "\"e55e02\""))
				.andExpect(status().isNotFound());
	}

	@Test
	void hiddenVenuePhotoIs404ToANonOwningOperator() throws Exception {
		VenueId hidden = newHiddenVenueWithCover("e55e03", new byte[] {1});
		Cookie other = SessionLoginSupport.operatorSession(mvc, OTHER_OPERATOR, OPERATOR_PW);

		mvc.perform(get(SERVE_PATH, hidden.value(), "e55e03").cookie(other))
				.andExpect(status().isNotFound());
		mvc.perform(get(SERVE_PATH, hidden.value(), "e55e03").cookie(other)
						.header(HttpHeaders.IF_NONE_MATCH, "\"e55e03\""))
				.andExpect(status().isNotFound());
	}

	@Test
	void ownerPreviewsAHiddenVenuePhotoPrivately() throws Exception {
		byte[] payload = {9, 8, 7};
		VenueId hidden = newHiddenVenueWithCover("e55e04", payload);

		assertPreviewedPrivately(SessionLoginSupport.operatorSession(mvc, PENDING_OWNER, OPERATOR_PW),
				hidden, "e55e04", payload);
	}

	@Test
	void adminPreviewsAHiddenVenuePhotoPrivately() throws Exception {
		byte[] payload = {6, 5, 4};
		VenueId hidden = newHiddenVenueWithCover("e55e05", payload);

		assertPreviewedPrivately(SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW),
				hidden, "e55e05", payload);
	}

	/** Bytes and 304 both come back under a private directive, so no shared cache stores them. */
	private void assertPreviewedPrivately(Cookie session, VenueId venue, String hash, byte[] payload)
			throws Exception {
		mvc.perform(get(SERVE_PATH, venue.value(), hash).cookie(session))
				.andExpect(status().isOk())
				.andExpect(content().bytes(payload))
				.andExpect(header().string(HttpHeaders.CACHE_CONTROL, allOf(
						containsString("no-cache"), containsString("private"), not(containsString("public")))));
		mvc.perform(get(SERVE_PATH, venue.value(), hash).cookie(session)
						.header(HttpHeaders.IF_NONE_MATCH, "\"" + hash + "\""))
				.andExpect(status().isNotModified())
				.andExpect(header().string(HttpHeaders.CACHE_CONTROL, allOf(
						containsString("private"), not(containsString("public")))));
	}
}
