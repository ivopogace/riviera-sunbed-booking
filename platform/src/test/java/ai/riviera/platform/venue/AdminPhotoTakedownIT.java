package ai.riviera.platform.venue;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
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

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The platform-admin photo takedown end to end (#504) — the "remove" half of report-and-remove
 * (#230). It proves the thing the operator's own delete cannot do: reach a venue the caller does
 * <strong>not</strong> own. The venue-scoped {@code DELETE /api/venues/{v}/photos/{slot}} answers a
 * non-owner {@code 403 NOT_VENUE_OWNER} before it looks at the slot (invariant #13,
 * {@code CrossVenueDenialIT}) — i.e. it refuses exactly the case moderation exists for — so the
 * admin surface lives under {@code /api/admin/**}, which that invariant exempts, and is gated on the
 * {@code ADMIN} role instead.
 *
 * <p><strong>Why a second operator is provisioned.</strong> The bootstrap {@code operator} account is
 * the platform admin ({@code is_admin}, V29) and therefore carries <em>both</em> {@code ADMIN} and
 * {@code OPERATOR} (see {@code OperatorUserDetailsService}). Its session can never demonstrate the
 * {@code 403}, so a plain {@code ACTIVE} operator is provisioned through the real
 * {@code OperatorProvisioning} and logged in for its own session — the role gate is then checked
 * with a principal that genuinely holds only {@code OPERATOR}.
 *
 * <p>Every photo here is seeded through the real {@link PhotoStorage} adapter against Testcontainers
 * Postgres, and each venue gets its own single-slot cover, so the "the URL 404s afterwards"
 * assertion is honest: no other slot duplicates those bytes, which is the one case where the
 * content-addressed serving read would keep answering (V24's deliberately non-unique
 * {@code (venue_id, content_hash)} index, #142 F-2). Skipped where Docker is absent; CI runs it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class AdminPhotoTakedownIT {

	private static final String ADMIN = "operator"; // the bootstrap account, demoted to platform admin (V29)
	private static final String ADMIN_PW = "test-operator-pw";
	private static final String PLAIN_OPERATOR = "takedown-plain-op";
	private static final String PLAIN_OPERATOR_PW = "plain-op-pw";
	private static final String TAKEDOWN_PATH = "/api/admin/venues/{v}/photos/{slot}";
	private static final String SERVE_PATH = "/api/venues/{v}/photos/{h}";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	PhotoStorage storage;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void provisionAPlainOperator() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", PLAIN_OPERATOR).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", PLAIN_OPERATOR).update();
		provisioning.provision(PLAIN_OPERATOR, encoder.encode(PLAIN_OPERATOR_PW));
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW);
	}

	private Cookie plainOperatorSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, PLAIN_OPERATOR, PLAIN_OPERATOR_PW);
	}

	/**
	 * A fresh venue owned by nobody, holding a complete COVER photo. No {@code operator_venue} row is
	 * written for it — not for the admin either — so every takedown here is genuinely cross-venue.
	 */
	private VenueId newVenueWithCover(String cardHash, String bannerHash) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Takedown IT Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		VenueId venue = new VenueId(id);
		storage.replace(venue, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, cardHash),
				variant(PhotoSurface.BANNER, bannerHash))));
		return venue;
	}

	private static StoredVariant variant(PhotoSurface surface, String hashHex) {
		return new StoredVariant(surface, new ContentHash(hashHex), "image/jpeg", 640, 384, new byte[] {1, 2});
	}

	@Test
	void takenDownPhotoStopsServingAndDropsOutOfTheTouristReads() throws Exception {
		VenueId venue = newVenueWithCover("a0c1", "a0b1");

		mvc.perform(delete(TAKEDOWN_PATH, venue.value(), "cover").cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		mvc.perform(get(SERVE_PATH, venue.value(), "a0c1")).andExpect(status().isNotFound());
		mvc.perform(get(SERVE_PATH, venue.value(), "a0b1")).andExpect(status().isNotFound());
		mvc.perform(get("/api/venues/{v}", venue.value()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.coverPhoto").value(nullValue()));
		mvc.perform(get("/api/venues"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d && @.coverPhoto == null)]", venue.value()).exists());
	}

	@Test
	void adminTakesDownAPhotoOfAVenueItDoesNotOwn() throws Exception {
		// The point of the slice: no operator_venue row ties the admin to this venue, so the venue-scoped
		// route would answer 403 NOT_VENUE_OWNER. The /api/admin/** twin is exempt (invariant #13) → 204.
		VenueId unowned = newVenueWithCover("b0c1", "b0b1");

		mvc.perform(delete("/api/venues/{v}/photos/{slot}", unowned.value(), "cover")
						.cookie(adminSession()).with(csrf()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));

		mvc.perform(delete(TAKEDOWN_PATH, unowned.value(), "cover").cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());
	}

	@Test
	void takedownIsAdminOnly() throws Exception {
		VenueId venue = newVenueWithCover("c0c1", "c0b1");

		// A valid CSRF token rides both refusals so each pins the auth/role gate, not the CsrfFilter.
		mvc.perform(delete(TAKEDOWN_PATH, venue.value(), "cover").with(csrf()))
				.andExpect(status().isUnauthorized());
		mvc.perform(delete(TAKEDOWN_PATH, venue.value(), "cover")
						.cookie(plainOperatorSession()).with(csrf()))
				.andExpect(status().isForbidden());

		// The gate held rather than merely answering: the photo is still there for the admin to remove.
		mvc.perform(get(SERVE_PATH, venue.value(), "c0c1")).andExpect(status().isOk());
	}

	@Test
	void takedownOfSomethingThatIsNotThereIs404() throws Exception {
		VenueId venue = newVenueWithCover("d0c1", "d0b1");
		Cookie admin = adminSession();

		// An empty slot of a real venue and a venue id that does not exist answer identically.
		for (long target : List.of(venue.value(), venue.value() + 9_999)) {
			String slot = target == venue.value() ? "bar" : "cover";
			mvc.perform(delete(TAKEDOWN_PATH, target, slot).cookie(admin).with(csrf()))
					.andExpect(status().isNotFound())
					.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
					.andExpect(jsonPath("$.code").value("NO_SUCH_PHOTO"));
		}
	}

	@Test
	void unknownSlotIs400() throws Exception {
		mvc.perform(delete(TAKEDOWN_PATH, 1L, "lobby").cookie(adminSession()).with(csrf()))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}
}
