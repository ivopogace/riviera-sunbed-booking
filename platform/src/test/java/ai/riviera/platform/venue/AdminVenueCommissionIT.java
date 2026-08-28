package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;

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
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;

import jakarta.servlet.http.Cookie;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The platform-admin commission surface end to end — the venues-with-commission read
 * and the rate write, against Testcontainers Postgres through the real security filter chain.
 *
 * <p><strong>Why a second operator is provisioned</strong> (same reason as
 * {@code AdminPhotoModerationIT} / {@code AdminPhotoTakedownIT}):
 * the bootstrap {@code operator} account is the platform admin ({@code is_admin}, V29) and so carries
 * <em>both</em> {@code ADMIN} and {@code OPERATOR} — its session can never demonstrate a {@code 403}.
 * Neither can {@code CrossVenueDenialIT}'s {@code operatorA}, which has no {@code password_hash} and
 * is an ownership identity rather than a session one. So a plain {@code ACTIVE} operator is
 * provisioned through the real {@code OperatorProvisioning}, given a session, and made the venue's
 * genuine owner — the real shape of the thing: the platform changing a rate on a venue somebody else
 * owns.
 *
 * <p>{@link #theOwnerCannotChangeItsOwnRateThroughEitherSurface} is the slice's whole argument in one
 * place: the owner is refused on the admin path (wrong role) <em>and</em> the profile {@code PATCH}
 * still ignores the field. Keeping both halves in one test means a future change cannot
 * quietly satisfy one alone — widening the {@code PATCH} would look like a passing build otherwise.
 *
 * <p>Runs only when Docker is available; CI runs it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class AdminVenueCommissionIT {

	private static final String ADMIN = "operator"; // the bootstrap account, demoted to platform admin (V29)
	private static final String ADMIN_PW = "test-operator-pw";
	private static final String PLAIN_OPERATOR = "commission-plain-op";
	private static final String PLAIN_OPERATOR_PW = "plain-op-pw";
	private static final String VENUES_PATH = "/api/admin/venues";
	private static final String COMMISSION_PATH = "/api/admin/venues/{venueId}/commission";
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
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

	@Test
	void adminListsEveryVenueWithItsCommissionRate() throws Exception {
		long venueId = venueOwnedByThePlainOperator("A7 List Venue", 1500);

		mvc.perform(get(VENUES_PATH).cookie(adminSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].commissionBps".formatted(venueId))
						.value(1500))
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].name".formatted(venueId))
						.value("A7 List Venue"))
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].payoutCurrency".formatted(venueId))
						.value("EUR"));
	}

	@Test
	void adminChangesAVenuesRateForwardOnly() throws Exception {
		long venueId = venueOwnedByThePlainOperator("A7 Write Venue", 1500);

		mvc.perform(put(COMMISSION_PATH, venueId).cookie(adminSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"commissionBps\":2000}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venueId").value(venueId))
				.andExpect(jsonPath("$.commissionBps").value(2000));

		assertThat(liveRate(venueId))
				.as("the live rate moves at once — the next accrual applies it")
				.isEqualTo(2000);
		assertThat(scheduledFrom(venueId, 2000))
				.as("the new rate is scheduled from today in Europe/Tirane: same-day sales stay open "
						+ "(invariant #4), so today's reporting must match the live rate accruals use")
				.isEqualTo(LocalDate.now(TIRANE));
		assertThat(scheduledFrom(venueId, 1500))
				.as("and the superseded rate is pinned back to the floor, so no past day reprices")
				.isEqualTo(LocalDate.of(1970, 1, 1));
	}

	@Test
	void commissionSurfaceIsAdminOnly() throws Exception {
		long venueId = venueOwnedByThePlainOperator("A7 Gate Venue", 1500);
		String body = "{\"commissionBps\":2000}";

		mvc.perform(get(VENUES_PATH)).andExpect(status().isUnauthorized());
		mvc.perform(put(COMMISSION_PATH, venueId).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isUnauthorized());

		Cookie plainOperator = plainOperatorSession();
		mvc.perform(get(VENUES_PATH).cookie(plainOperator)).andExpect(status().isForbidden());
		mvc.perform(put(COMMISSION_PATH, venueId).cookie(plainOperator).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isForbidden());

		assertThat(liveRate(venueId)).as("a refused write changes nothing").isEqualTo(1500);
		// The gate held rather than merely answering: the admin still gets through.
		mvc.perform(get(VENUES_PATH).cookie(adminSession())).andExpect(status().isOk());
	}

	@Test
	void theOwnerCannotChangeItsOwnRateThroughEitherSurface() throws Exception {
		long venueId = venueOwnedByThePlainOperator("A7 Owner Venue", 1500);
		Cookie owner = plainOperatorSession();

		// The admin path refuses the owner: owning the venue is not authority over its commission.
		mvc.perform(put(COMMISSION_PATH, venueId).cookie(owner).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"commissionBps\":100}"))
				.andExpect(status().isForbidden());

		// And its own profile PATCH still ignores the field entirely — the DTO has none.
		mvc.perform(patch("/api/venues/{v}", venueId).cookie(owner).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"A7 Owner Venue","beach":"Test Beach","region":"Test Region",
								 "description":null,"bookingMode":"INSTANT","bookingCutoff":"18:00",
								 "amenities":[],"distanceToWaterM":null,"commissionBps":100,
								 "expectedVersion":0}
								"""))
				.andExpect(status().isNoContent());

		assertThat(liveRate(venueId))
				.as("neither surface lets a venue set its own commission")
				.isEqualTo(1500);
	}

	@Test
	void unknownVenueIsNotFound() throws Exception {
		mvc.perform(put(COMMISSION_PATH, 999_999_999L).cookie(adminSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"commissionBps\":2000}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_VENUE"));
	}

	@Test
	void anOutOfRangeRateIsRejectedAndChangesNothing() throws Exception {
		long venueId = venueOwnedByThePlainOperator("A7 Range Venue", 1500);

		mvc.perform(put(COMMISSION_PATH, venueId).cookie(adminSession()).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"commissionBps\":10001}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		assertThat(liveRate(venueId)).isEqualTo(1500);
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

	private long venueOwnedByThePlainOperator(String name, int commissionBps) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Test Beach', 'Test Region', 'INSTANT', :bps, 'EUR')
				RETURNING id
				""")
				.param("name", name)
				.param("bps", commissionBps)
				.query(Long.class)
				.single();
		ownership.assignOwner(new OperatorId(plainOperatorId()), new VenueRef(id));
		return id;
	}

	private int liveRate(long venueId) {
		return jdbc.sql("SELECT commission_bps FROM venue WHERE id = :id")
				.param("id", venueId).query(Integer.class).single();
	}

	private LocalDate scheduledFrom(long venueId, int commissionBps) {
		return jdbc.sql("""
				SELECT effective_from FROM venue_commission_rate
				 WHERE venue_id = :id AND commission_bps = :bps
				""")
				.param("id", venueId)
				.param("bps", commissionBps)
				.query(LocalDate.class)
				.single();
	}
}
