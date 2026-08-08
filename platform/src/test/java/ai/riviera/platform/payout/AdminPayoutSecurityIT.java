package ai.riviera.platform.payout;

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

import jakarta.servlet.http.Cookie;

import org.springframework.http.MediaType;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The two payout surfaces' authorization gates, which are deliberately <em>different</em> roles.
 *
 * <p><strong>The venue-scoped ledger read</strong> {@code GET /api/venues/{id}/payout-ledger}
 * (AC-8) is operator financial data: unauthenticated is {@code 401}, and an operator
 * reads its own venue's ledger. It is gated BEFORE the public {@code GET /api/venues/**}, and the
 * per-venue ownership check itself lives in the application service (invariant #13).
 *
 * <p><strong>The platform-wide batch report</strong> {@code /api/admin/payout-batches} is
 * <strong>ADMIN</strong>-gated. It has no venue scoping at all — the GET returns every
 * venue's gross/commission/net for the period and the PATCH marks any venue's batch by id — so under
 * the previous {@code OPERATOR} gate every approved operator in this multi-tenant marketplace could
 * read competitors' payout figures and mutate their settlement state (object-level authorization by
 * role alone, OWASP API #1). Invariant #13 exempts {@code /api/admin/**} from per-venue ownership, so
 * the role gate <em>is</em> the whole authorization and these tests are its only proof.
 *
 * <p><strong>Why a second operator is provisioned</strong> (the {@code AdminPhotoModerationIT} /
 * {@code AdminPhotoTakedownIT} precedent, for the same reason): the bootstrap {@code operator}
 * account is the platform admin ({@code is_admin}, V29) and so carries <em>both</em> {@code ADMIN}
 * and {@code OPERATOR}. Its session can never demonstrate the {@code 403} — every assertion riding it
 * is invariant under the tightening — so a plain {@code ACTIVE} operator is provisioned through the
 * real {@link OperatorProvisioning} and given a session of its own. Sessions are minted on demand
 * rather than in {@code @BeforeEach} to keep each username's login-rate budget (D-8) unspent by tests
 * that do not need it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class AdminPayoutSecurityIT {

	private static final String ADMIN = "operator"; // the bootstrap account, demoted to platform admin (V29)
	private static final String ADMIN_PW = "test-operator-pw";
	private static final String PLAIN_OPERATOR = "payout-plain-op";
	private static final String PLAIN_OPERATOR_PW = "payout-plain-op-pw";
	private static final String BATCHES_PATH = "/api/admin/payout-batches";
	private static final String PERIOD = "period";
	private static final String A_PERIOD = "2099-W30";
	private static final String REPORTED_BODY = """
			{"status":"REPORTED"}""";
	private static final long MIRAMAR = 1L;

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
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

	@Test
	void ledgerReadRequiresOperator() throws Exception {
		mvc.perform(get("/api/venues/{id}/payout-ledger", MIRAMAR))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void operatorReadsTheLedger() throws Exception {
		mvc.perform(get("/api/venues/{id}/payout-ledger", MIRAMAR).cookie(adminSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venueId").value((int) MIRAMAR));
	}

	@Test
	void batchReportRequiresAdmin() throws Exception {
		mvc.perform(get(BATCHES_PATH).param(PERIOD, A_PERIOD))
				.andExpect(status().isUnauthorized());
		// The POST carries a valid CSRF token so the rejection pins the auth gate (401 from the
		// entry point), not the CsrfFilter's 403.
		mvc.perform(post(BATCHES_PATH).with(csrf()).param(PERIOD, A_PERIOD))
				.andExpect(status().isUnauthorized());
	}

	/**
	 * The PATCH item path is a distinct matcher ({@code PAYOUT_BATCH_ITEM_PATH}) and it advances a batch
	 * toward {@code SETTLED}, so it must be gated too — unauthenticated is {@code 401}. A valid CSRF
	 * token is supplied so the rejection pins the auth gate, not the {@code CsrfFilter}'s {@code 403}.
	 */
	@Test
	void batchStatusPatchRequiresAdmin() throws Exception {
		mvc.perform(patch(BATCHES_PATH + "/{id}", 1L).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(REPORTED_BODY))
				.andExpect(status().isUnauthorized());
	}

	/**
	 * AC-1: the cross-tenant <em>read</em>. An authenticated operator that is not a platform
	 * admin is refused at the edge, so {@code PayoutReport#forPeriod} never runs and no other venue's
	 * gross/commission/net is disclosed.
	 */
	@Test
	void plainOperatorIsRefusedTheBatchReport() throws Exception {
		mvc.perform(get(BATCHES_PATH).param(PERIOD, A_PERIOD).cookie(plainOperatorSession()))
				.andExpect(status().isForbidden());
	}

	/**
	 * AC-3: batch <em>generation</em> is a write over every venue's ledger for the period,
	 * and is refused on the same gate as the read.
	 */
	@Test
	void plainOperatorIsRefusedBatchGeneration() throws Exception {
		mvc.perform(post(BATCHES_PATH).with(csrf()).param(PERIOD, A_PERIOD)
						.cookie(plainOperatorSession()))
				.andExpect(status().isForbidden());
	}

	/**
	 * AC-2: the cross-tenant <em>write</em>, and the sharper half of the hole — the batch is
	 * addressed by id with no ownership check, so under the old gate any operator could mark any
	 * venue's batch settled. A valid CSRF token is supplied so the {@code 403} is the authorization
	 * gate's, not the {@code CsrfFilter}'s.
	 */
	@Test
	void plainOperatorIsRefusedTheBatchStatusPatch() throws Exception {
		mvc.perform(patch(BATCHES_PATH + "/{id}", 1L).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(REPORTED_BODY)
						.cookie(plainOperatorSession()))
				.andExpect(status().isForbidden());
	}

	/** AC-4: the tightening denies the operator without breaking the admin the surface exists for. */
	@Test
	void adminReadsTheBatchReport() throws Exception {
		mvc.perform(get(BATCHES_PATH).param(PERIOD, A_PERIOD).cookie(adminSession()))
				.andExpect(status().isOk());
	}

	@Test
	void malformedPeriodIsBadRequest() throws Exception {
		mvc.perform(get(BATCHES_PATH).param(PERIOD, "not-a-week").cookie(adminSession()))
				.andExpect(status().isBadRequest());
	}
}
