package ai.riviera.platform;

import java.net.URI;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Email S7 (#375) end to end through the real admin surface against Testcontainers Postgres: approving
 * a self-registered operator mails it the sign-in link, and <em>nothing else in the lifecycle mails
 * anything</em>. The negative half is the load-bearing half — "sends one mail" is easy to satisfy by
 * accident from a lifecycle listener that also fires on reject or reinstate, and the operator learning
 * by email that it was rejected is a product decision this slice did not make.
 *
 * <p>The send is inline here because {@code TestcontainersConfiguration} imports
 * {@code SynchronousMailDispatch}; that it genuinely leaves the request thread in production is pinned
 * where it belongs, by {@code TransactionalMailServiceTest} and {@code AsyncMailDispatcherTest}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=admin-pw")
@AutoConfigureMockMvc
class OperatorApprovalMailIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "admin-pw";
	private static final String PENDING_PW = "pending-op-pw-123";
	private static final String SIGN_IN_PATH = "/account/sign-in";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	MockMailer mailer;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username LIKE 'mail-appr-%')").update();
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'mail-appr-%'").update();
		mailer.clear();
	}

	@Test
	void approvingAPendingOperatorMailsItTheSignInLink() throws Exception {
		long id = registerPending("mail-appr-alice");

		approve(id).andExpect(status().isNoContent());

		SentEmail mail = theOnlyMailTo(emailOf("mail-appr-alice"));
		assertEquals(SentEmail.Kind.OPERATOR_APPROVED, mail.kind());
		URI link = mail.link();
		assertEquals(SIGN_IN_PATH, link.getPath(), "the notice points at the audience-aware sign-in page");
		// A relative link is dead in a mail client, so the absolute origin is part of the contract.
		assertTrue(link.isAbsolute(), "the emailed link must carry the deployed origin");
	}

	/**
	 * AC-2. The guard that makes this true lives in the {@code WHERE status = PENDING} clause, not here:
	 * the second call transitions nothing, so it is handed no address and has nothing to send.
	 */
	@Test
	void aSecondApprovalMailsNothing() throws Exception {
		long id = registerPending("mail-appr-bob");
		approve(id).andExpect(status().isNoContent());

		approve(id).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_PENDING"));

		assertEquals(1, mailsTo(emailOf("mail-appr-bob")).size(), "one approval, one mail");
	}

	/**
	 * AC-3. Reject is explicitly out of scope for this slice, and suspend/reinstate were never in it —
	 * telling an operator by email that it has been suspended is a separate product decision.
	 */
	@Test
	void rejectAndSuspendReinstateMailNothing() throws Exception {
		long rejected = registerPending("mail-appr-carol");
		mvc.perform(post("/api/admin/operators/{id}/reject", rejected).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		long suspended = registerPending("mail-appr-dave");
		approve(suspended).andExpect(status().isNoContent());
		mailer.clear();

		mvc.perform(post("/api/admin/operators/{id}/suspend", suspended).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());
		mvc.perform(post("/api/admin/operators/{id}/reinstate", suspended).cookie(adminSession()).with(csrf()))
				.andExpect(status().isNoContent());

		assertEquals(List.of(), mailer.sent(), "only approval mails, and only once, at approval");
	}

	private org.springframework.test.web.servlet.ResultActions approve(long operatorId) throws Exception {
		return mvc.perform(post("/api/admin/operators/{id}/approve", operatorId)
				.cookie(adminSession()).with(csrf()));
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW);
	}

	private static String emailOf(String username) {
		return username + "@venue.example";
	}

	private List<SentEmail> mailsTo(String toEmail) {
		return mailer.sent().stream().filter(e -> e.toEmail().equals(toEmail)).toList();
	}

	private SentEmail theOnlyMailTo(String toEmail) {
		List<SentEmail> mails = mailsTo(toEmail);
		assertEquals(1, mails.size(), "exactly one mail for this address");
		return mails.getFirst();
	}

	/** Self-register a PENDING operator through the public endpoint and return its id. */
	private long registerPending(String username) throws Exception {
		mvc.perform(post("/api/auth/operator/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username":"%s","password":"%s","contactEmail":"%s"}"""
						.formatted(username, PENDING_PW, emailOf(username))))
				.andExpect(status().isAccepted());
		return jdbc.sql("SELECT id FROM operator WHERE username = :u")
				.param("u", username).query(Long.class).single();
	}
}
