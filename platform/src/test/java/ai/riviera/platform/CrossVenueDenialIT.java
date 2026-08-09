package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentOperator;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import jakarta.servlet.http.Cookie;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The cross-venue denial matrix (AC-4/AC-5) — the reference deliverable proving the BOLA
 * fix (invariant #13, OWASP API #1). For <strong>every</strong> venue-scoped endpoint, an operator
 * that does not own the target venue gets {@code 403}; the owning operator does not; and the
 * platform-wide {@code /api/admin/**} surface plus {@code POST /api/venues} (no path {@code venueId})
 * stay role-gated only.
 *
 * <p>Two synthetic per-venue operators are seeded, each owning its own fresh venue (<strong>A</strong>
 * and <strong>B</strong>); Miramar (venue 1) is owned by neither (it is backfilled to the bootstrap
 * admin), so a non-owner denial can target it too. The real {@code VenueOwnership} runs against
 * the real {@code operator} tables; only the edge {@link CurrentOperator} (principal → operator id)
 * is mocked, so each request is attributed to A or B independently of the
 * shared bootstrap login. The session cookie (from one real login) still satisfies the
 * role gate. The staff-availability case is the spoofing test: A uses <em>its own</em> venue in the
 * URL path but a Miramar {@code setId}, and is still denied because the service resolves the owning
 * venue from the set, never the path.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class CrossVenueDenialIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final long MIRAMAR = 1L; // seeded venue, backfilled to the bootstrap admin — A/B own neither

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	/** Mock only the identity seam; the ownership check itself is the real DB-backed bean. */
	@MockitoBean
	CurrentOperator currentOperator;

	private OperatorId operatorA;
	private OperatorId operatorB;
	private long venueOwnedByA;
	private long venueOwnedByB;
	private long bSetId; // an ONLINE set in venueOwnedByB, for the venue-resolved-from-set owner path
	private long miramarSetId;
	private Cookie operatorSession;

	@BeforeEach
	void seedTwoOperators() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username IN ('op-a', 'op-b'))").update();
		jdbc.sql("DELETE FROM operator WHERE username IN ('op-a', 'op-b')").update();

		venueOwnedByA = newVenue("Operator A Venue");
		venueOwnedByB = newVenue("Operator B Venue");
		operatorA = insertOperator("op-a");
		operatorB = insertOperator("op-b");
		grant(operatorA, venueOwnedByA);
		grant(operatorB, venueOwnedByB);
		bSetId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1) RETURNING id
				""").param("v", venueOwnedByB).query(Long.class).single();
		miramarSetId = jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", MIRAMAR).query(Long.class).single();
	}

	private long newVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).query(Long.class).single();
	}

	private OperatorId insertOperator(String username) {
		long id = jdbc.sql("INSERT INTO operator (username, status) "
						+ "VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", username).query(Long.class).single();
		return new OperatorId(id);
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator.value()).update();
	}

	/** Attribute every subsequent request in the test to this operator (bypassing the interim resolver). */
	private void actingAs(OperatorId operator) {
		when(currentOperator.require(any())).thenReturn(operator);
	}

	// ---- Denials: operator A (does NOT own Miramar) is 403 on every venue-scoped surface ----

	@Test
	void beachMapEditByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		String setBody = """
				{"rowLabel":"Row A","positionNo":1,"tier":"STANDARD","pool":"ONLINE",
				 "price":{"minorUnits":3000,"currency":"EUR"},"gridX":1,"gridY":1}
				""";
		// The 403 shape is the one error contract: ProblemDetail + stable code.
		mvc.perform(post("/api/venues/{v}/sets", MIRAMAR).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(setBody))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void beachMapLayoutReplaceByNonOwnerIs403() throws Exception {
		// The bulk layout replace is venue-scoped — a non-owner is denied before any read/write,
		// so Miramar's layout is never touched. Ownership asserts first (invariant #13, BOLA). The body is
		// VALID — including the required expectedVersion — so ExpectedVersion.require passes and the
		// 403 is genuinely from ownership, not a 400 (parse-then-authorize; mirrors FULL_PROFILE_BODY).
		actingAs(operatorA);
		String layoutBody = """
				{"sets":[{"rowLabel":"A","positionNo":1,"tier":"PREMIUM","pool":"ONLINE",
				 "price":{"minorUnits":3500,"currency":"EUR"},"gridX":1,"gridY":1}],
				 "expectedVersion":0}
				""";
		mvc.perform(put("/api/venues/{v}/beach-map", MIRAMAR).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(layoutBody))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void rowRepriceByNonOwnerIs403() throws Exception {
		// Repricing a beach-map row is venue-scoped — a non-owner is denied before any
		// read/write, so Miramar's prices are never touched. Ownership asserts first (invariant #13). The
		// body is VALID — including the required expectedVersion — so the 403 is genuinely from
		// ownership, not a 400 (parse-then-authorize; mirrors FULL_PROFILE_BODY).
		actingAs(operatorA);
		mvc.perform(put("/api/venues/{v}/rows/{r}/price", MIRAMAR, "A").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"price\":{\"minorUnits\":9999,\"currency\":\"EUR\"},\"expectedVersion\":0}"))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void staffBookingsReadByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/bookings", MIRAMAR).cookie(operatorSession))
				.andExpect(status().isForbidden());
	}

	/** A full, VALID widened profile body: valid — including the required
	 *  {@code expectedVersion} — so {@code toCommand()}/{@code ExpectedVersion.require} pass and the
	 *  403 comes from the service's ownership check, not from body/version validation (parse-then-authorize).
	 *  The owning-venue counterpart edits a fresh venue, so {@code expectedVersion} 0 matches. */
	private static final String FULL_PROFILE_BODY = """
			{"name":"Edited","beach":"Ksamil","region":"Riviera","description":"x",
			 "bookingMode":"INSTANT","bookingCutoff":"18:00","amenities":["BEACH_BAR"],
			 "distanceToWaterM":15,"expectedVersion":0}
			""";

	@Test
	void venueProfileEditByNonOwnerIs403() throws Exception {
		// Editing a venue's profile is venue-scoped (invariant #13, BOLA). A
		// does not own Miramar → 403 before any write, so Miramar's profile is left untouched. The body
		// is VALID so the 403 is genuinely from ownership, not from request validation.
		actingAs(operatorA);
		mvc.perform(patch("/api/venues/{v}", MIRAMAR).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(FULL_PROFILE_BODY))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void venueProfileReadByNonOwnerIs403() throws Exception {
		// The owner profile read carries the commission rate + payout currency — venue
		// financial data — so a non-owner must be denied (invariant #13, BOLA). A does not own Miramar.
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/profile", MIRAMAR).cookie(operatorSession))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void weatherRefundByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		mvc.perform(post("/api/venues/{v}/weather-refund", MIRAMAR).cookie(operatorSession)
						.with(csrf()).param("date", "2020-01-01"))
				.andExpect(status().isForbidden());
	}

	@Test
	void payoutLedgerReadByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/payout-ledger", MIRAMAR).cookie(operatorSession))
				.andExpect(status().isForbidden());
	}

	@Test
	void takingsReadByNonOwnerIs403() throws Exception {
		// A venue's daily online takings are financial data — a non-owner must not read them.
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/takings", MIRAMAR).cookie(operatorSession))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void dailyAvailabilityReadByNonOwnerIs403() throws Exception {
		// The hold split is operator data — denied BEFORE any existence probe (invariant #13).
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/availability", MIRAMAR).cookie(operatorSession)
						.param("date", "2026-09-14"))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void staffAvailabilityMarkByNonOwnerIs403_evenWhenSpoofingThePathVenue() throws Exception {
		// A owns venueOwnedByA and puts it in the PATH, but targets a Miramar setId. The check must
		// resolve the venue from the set (Miramar → owned by B), not the path → 403 (invariant #13, R-2).
		actingAs(operatorA);
		mvc.perform(post("/api/venues/{v}/sets/{s}/availability", venueOwnedByA, miramarSetId)
						.cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"2035-07-01\"}"))
				.andExpect(status().isForbidden());

		mvc.perform(delete("/api/venues/{v}/sets/{s}/availability", venueOwnedByA, miramarSetId)
						.cookie(operatorSession).with(csrf()).param("date", "2035-07-01"))
				.andExpect(status().isForbidden());
	}

	@Test
	void photoUploadByNonOwnerIs403() throws Exception {
		// The photo slot upload is venue-scoped (invariant #13, BOLA). The file is a VALID
		// JPEG so the 403 is genuinely from ownership, not from image validation — and the service
		// asserts ownership BEFORE processing, so Miramar's slot is never touched.
		actingAs(operatorA);
		mvc.perform(multipart("/api/venues/{v}/photos/{slot}", MIRAMAR, "cover")
						.file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", tinyJpeg()))
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void photoDeleteByNonOwnerIs403() throws Exception {
		// Deleting a photo slot is venue-scoped — denied before the slot is even looked at,
		// so a non-owner gets 403 (not the owner's 404-when-empty).
		actingAs(operatorA);
		mvc.perform(delete("/api/venues/{v}/photos/{slot}", MIRAMAR, "cover")
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void pendingRequestsQueueByNonOwnerIs403() throws Exception {
		// The pending-requests queue is venue-scoped operator data (guest names, demand).
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/booking-requests", MIRAMAR).cookie(operatorSession))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void acceptRequestByNonOwnerIs403() throws Exception {
		// Accept moves money (issues the payment request) — the ownership check must fire
		// BEFORE any state is read or transitioned, so even a nonexistent bookingId is 403, not 404.
		actingAs(operatorA);
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/accept", MIRAMAR, 999_999)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void declineRequestByNonOwnerIs403() throws Exception {
		actingAs(operatorA);
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/decline", MIRAMAR, 999_999)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	@Test
	void checkInByNonOwnerIs403() throws Exception {
		// Ownership fires BEFORE any lookup: even a nonexistent code is 403, never 404 (invariant #13).
		actingAs(operatorA);
		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", MIRAMAR, "ZZZZ99999X")
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}

	// ---- The owner (B) is NOT forbidden on the same surfaces ----

	@Test
	void ownerCheckInOfUnknownCodeIs404NotForbidden() throws Exception {
		actingAs(operatorB);
		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venueOwnedByB, "ZZZZ99999X")
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_FOUND"));
	}

	@Test
	void ownerRequestSurfacesAreNotForbidden() throws Exception {
		// The positive counterparts: for the owner the queue is 200, and accept/decline of an
		// unknown request are 404 (the check passed; the id is simply not a pending request).
		actingAs(operatorB);
		mvc.perform(get("/api/venues/{v}/booking-requests", venueOwnedByB).cookie(operatorSession))
				.andExpect(status().isOk());
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/accept", venueOwnedByB, 999_999)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_REQUEST"));
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/decline", venueOwnedByB, 999_999)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_REQUEST"));
	}


	@Test
	void ownerReadsAreNotForbidden() throws Exception {
		actingAs(operatorB);
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByB).cookie(operatorSession))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/payout-ledger", venueOwnedByB).cookie(operatorSession))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/takings", venueOwnedByB).cookie(operatorSession))
				.andExpect(status().isOk());
		// The owner's daily availability read passes — proving its 403 is genuinely ownership.
		mvc.perform(get("/api/venues/{v}/availability", venueOwnedByB).cookie(operatorSession)
						.param("date", "2026-09-14"))
				.andExpect(status().isOk());
		// A weather refund on a day with no bookings is a no-op (200), not a 403 — the check passed.
		mvc.perform(post("/api/venues/{v}/weather-refund", venueOwnedByB).cookie(operatorSession)
						.with(csrf()).param("date", "2019-02-02"))
				.andExpect(status().isOk());
	}

	@Test
	void ownerCanMarkItsOwnSet_venueResolvedFromTheSet() throws Exception {
		// The positive counterpart to the spoof denial: B owns venueOwnedByB (explicit operator_venue
		// mapping), so marking one of ITS sets — whose owning venue is resolved from the setId, not the
		// path — succeeds. Proves the venue-from-set happy path lets the real owner through, so the
		// spoof denial's 403 is genuinely from ownership, not an always-deny bug.
		actingAs(operatorB);
		mvc.perform(post("/api/venues/{v}/sets/{s}/availability", venueOwnedByB, bSetId)
						.cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"2036-03-03\"}"))
				.andExpect(status().isOk());
	}

	@Test
	void ownerCanUploadAndDeleteItsOwnPhoto() throws Exception {
		// The positive counterpart to the photo denials: A owns venueOwnedByA, so uploading and
		// deleting ITS cover photo succeed — proving the 403s are genuinely from ownership, not an
		// always-deny. Targets A's own throwaway venue, never Miramar (no shared-container pollution).
		actingAs(operatorA);
		mvc.perform(multipart("/api/venues/{v}/photos/{slot}", venueOwnedByA, "cover")
						.file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", tinyJpeg()))
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isOk());
		mvc.perform(delete("/api/venues/{v}/photos/{slot}", venueOwnedByA, "cover")
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isNoContent());
	}

	/** A small but genuinely valid JPEG (the ownership 403s must not be masked by a 400). */
	private static byte[] tinyJpeg() throws IOException {
		var image = new BufferedImage(80, 60, BufferedImage.TYPE_INT_RGB);
		var out = new ByteArrayOutputStream();
		ImageIO.write(image, "jpg", out);
		return out.toByteArray();
	}

	@Test
	void ownerCanEditItsOwnVenueProfile() throws Exception {
		// The positive counterpart to venueProfileEditByNonOwnerIs403: A owns venueOwnedByA, so
		// editing ITS profile succeeds (204) — proving the 403 is genuinely from ownership, not an
		// always-deny. Targets A's own throwaway venue, never Miramar, so no shared-container pollution.
		actingAs(operatorA);
		mvc.perform(patch("/api/venues/{v}", venueOwnedByA).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(FULL_PROFILE_BODY))
				.andExpect(status().isNoContent());
	}

	@Test
	void ownerCanReadItsOwnVenueProfile() throws Exception {
		// The positive counterpart to venueProfileReadByNonOwnerIs403: A owns venueOwnedByA, so reading
		// ITS profile succeeds (200), proving the read 403 is genuinely from ownership, not always-deny.
		actingAs(operatorA);
		mvc.perform(get("/api/venues/{v}/profile", venueOwnedByA).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.commissionBps").value(1500));
	}

	// ---- Exemptions: platform-wide admin + venue creation are role-gated only (no ownership) ----

	/**
	 * Invariant #13's {@code /api/admin/**} exemption, on the payout-batch surface: the acting
	 * principal owns none of the venues in the report, and is still not refused — because an admin does
	 * not <em>own</em> a payout run. Both methods are covered; the PATCH's {@code 404 NO_SUCH_BATCH} is
	 * a handler answer for an absent id, which is the proof it passed the gate rather than being
	 * refused ahead of it.
	 *
	 * <p><strong>The actor here is the bootstrap admin, deliberately, and no {@code actingAs} stub
	 * applies.</strong> Every request in this class rides one real login as {@code operator}, which V29
	 * demoted to the platform admin ({@code is_admin}) — so the session carries {@code ROLE_ADMIN},
	 * whatever the mocked {@link CurrentOperator} says. {@code actingAs} swaps the <em>ownership</em>
	 * identity the application services resolve, not the session's authorities, and this path consults
	 * no ownership at all; stubbing it here only ever implied an actor the request did not have. The
	 * surface is ADMIN-gated, so a plain operator is refused outright — pinned by
	 * {@code AdminPayoutSecurityIT}, which provisions a genuinely non-admin operator to prove it.
	 */
	@Test
	void adminPayoutBatchesAreRoleGatedNotOwnershipChecked() throws Exception {
		mvc.perform(get("/api/admin/payout-batches").cookie(operatorSession)
						.param("period", "2026-W01"))
				.andExpect(status().isOk());
		mvc.perform(patch("/api/admin/payout-batches/{id}", Long.MAX_VALUE).cookie(operatorSession)
						.with(csrf()).contentType(MediaType.APPLICATION_JSON)
						.content("{\"status\":\"REPORTED\"}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_BATCH"));
	}

	@Test
	void venueCreationIsNotOwnershipChecked() throws Exception {
		actingAs(operatorA);
		String venueBody = """
				{"name":"A New Venue","beach":"Ksamil","region":"Riviera","description":"x",
				 "bookingMode":"INSTANT","commissionBps":1500,"payoutCurrency":"EUR","bookingCutoff":"18:00"}
				""";
		// Any ACTIVE operator may create (role-gated, no prior owner to check) → 201.
		mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(venueBody))
				.andExpect(status().isCreated());
	}

	@Test
	void creatorOwnsCreatedVenueAndOthersAreDenied() throws Exception {
		// Creator-owns-on-create (invariant #13, BOLA): the operator that creates a venue owns it
		// from creation (the ownership row is written in the application service, atomically with the
		// insert), so the creator's venue-scoped reads pass and a DIFFERENT operator gets 403.
		actingAs(operatorA);
		String venueBody = """
				{"name":"A Owned-On-Create Venue","beach":"Ksamil","region":"Riviera","description":"x",
				 "bookingMode":"INSTANT","commissionBps":1500,"payoutCurrency":"EUR","bookingCutoff":"18:00"}
				""";
		MvcResult created = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(venueBody))
				.andExpect(status().isCreated())
				.andReturn();
		long newVenue = ((Number) JsonPath.read(created.getResponse().getContentAsString(), "$.id"))
				.longValue();

		// A (the creator) owns it → its owner-scoped profile read passes.
		mvc.perform(get("/api/venues/{v}/profile", newVenue).cookie(operatorSession))
				.andExpect(status().isOk());

		// B never created or was granted it → 403 NOT_VENUE_OWNER (owns-all is gone).
		actingAs(operatorB);
		mvc.perform(get("/api/venues/{v}/profile", newVenue).cookie(operatorSession))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("NOT_VENUE_OWNER"));
	}
}
