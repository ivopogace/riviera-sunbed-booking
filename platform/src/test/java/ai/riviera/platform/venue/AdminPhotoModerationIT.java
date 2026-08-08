package ai.riviera.platform.venue;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.application.PhotoStorage;
import ai.riviera.platform.venue.application.ProcessedPhoto;
import ai.riviera.platform.venue.application.StoredVariant;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The platform-admin photo moderation <strong>read</strong> end to end — the half the takedown was
 * missing. That takedown shipped an admin that could delete a photo it had no way to see: the only per-slot
 * view is the venue-scoped {@code GET /api/venues/{v}/profile}, which asserts ownership and answers
 * a non-owner {@code 403 NOT_VENUE_OWNER} — refusing exactly the case moderation exists for.
 *
 * <p>The first test therefore asserts <em>both</em> halves in one place: the venue-scoped read
 * refuses the admin, and the {@code /api/admin/**} twin answers. That pairing is the slice's whole
 * argument, and keeping it in one test means a future change cannot quietly satisfy one half alone.
 *
 * <p><strong>Why a second operator is provisioned</strong> (same reason as {@code AdminPhotoTakedownIT}):
 * the bootstrap {@code operator} account is the platform admin ({@code is_admin}, V29) and so carries
 * <em>both</em> {@code ADMIN} and {@code OPERATOR}. Its session can never demonstrate the {@code 403},
 * so a plain {@code ACTIVE} operator is provisioned through the real {@code OperatorProvisioning} and
 * given a session of its own. Here it is also made the venue's genuine <em>owner</em>, so the venue
 * the admin reads is owned by somebody else rather than by nobody — the real moderation shape.
 *
 * <p>Photos are seeded through the real {@link PhotoStorage} adapter against Testcontainers Postgres.
 * Skipped where Docker is absent; CI runs it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class AdminPhotoModerationIT {

	private static final String ADMIN = "operator"; // the bootstrap account, demoted to platform admin (V29)
	private static final String ADMIN_PW = "test-operator-pw";
	private static final String PLAIN_OPERATOR = "moderation-plain-op";
	private static final String PLAIN_OPERATOR_PW = "plain-op-pw";
	private static final String MODERATION_PATH = "/api/admin/venues/{v}/photos";
	private static final String COVER_PREVIEW = "$.photos.cover.previewUrl";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	PhotoStorage storage;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	VenueOwnership ownership;
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

	private long plainOperatorId() {
		return jdbc.sql("SELECT id FROM operator WHERE username = :u")
				.param("u", PLAIN_OPERATOR).query(Long.class).single();
	}

	/** A venue owned by the plain operator, carrying a COVER photo with a PREVIEW variant. */
	private VenueId venueOwnedByThePlainOperator(String previewHash) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Moderation IT Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		ownership.assignOwner(new OperatorId(plainOperatorId()), new VenueRef(id));
		VenueId venue = new VenueId(id);
		storage.replace(venue, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				new StoredVariant(PhotoSurface.PREVIEW, new ContentHash(previewHash),
						"image/jpeg", 480, 320, new byte[] {1, 2}))));
		return venue;
	}

	@Test
	void adminReadsAnotherOperatorsVenuePhotos() throws Exception {
		VenueId unowned = venueOwnedByThePlainOperator("ab01");
		Cookie admin = adminSession();

		// The gap this class closes: the venue-scoped per-slot view refuses the admin outright.
		mvc.perform(get("/api/venues/{v}/profile", unowned.value()).cookie(admin))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));

		// The /api/admin/** twin answers — every slot, occupied and empty.
		mvc.perform(get(MODERATION_PATH, unowned.value()).cookie(admin))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venueId").value(unowned.value()))
				.andExpect(jsonPath(COVER_PREVIEW)
						.value("/api/venues/" + unowned.value() + "/photos/ab01"))
				.andExpect(jsonPath("$.photos.sunbeds.previewUrl").value(nullValue()))
				.andExpect(jsonPath("$.photos.bar.previewUrl").value(nullValue()));
	}

	@Test
	void readIsForbiddenForOperatorAndUnauthenticatedAnonymously() throws Exception {
		VenueId venue = venueOwnedByThePlainOperator("ac01");

		mvc.perform(get(MODERATION_PATH, venue.value()))
				.andExpect(status().isUnauthorized());
		// Its own owner is still refused: this surface is platform moderation, not a venue read.
		mvc.perform(get(MODERATION_PATH, venue.value()).cookie(plainOperatorSession()))
				.andExpect(status().isForbidden());

		// The gate held rather than merely answering: the admin still sees the photo.
		mvc.perform(get(MODERATION_PATH, venue.value()).cookie(adminSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath(COVER_PREVIEW).isNotEmpty());
	}

	@Test
	void unknownVenueReadsAsAllSlotsEmpty() throws Exception {
		VenueId venue = venueOwnedByThePlainOperator("ad01");
		Cookie admin = adminSession();

		// An unknown venue and a photoless one answer identically, so neither leaks venue existence.
		for (long target : List.of(venue.value() + 9_999, emptyVenue())) {
			mvc.perform(get(MODERATION_PATH, target).cookie(admin))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.photos.cover.previewUrl").value(nullValue()))
					.andExpect(jsonPath("$.photos.sunbeds.previewUrl").value(nullValue()))
					.andExpect(jsonPath("$.photos.bar.previewUrl").value(nullValue()));
		}
	}

	private long emptyVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Moderation IT Photoless', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
	}
}
