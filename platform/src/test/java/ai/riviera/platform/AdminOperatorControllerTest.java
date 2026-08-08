package ai.riviera.platform;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.notification.api.MailSender;
import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin suspension surface's <strong>effect ordering</strong> — {@code POST
 * /api/admin/operators/{id}/suspend}. The transition itself, the role gate, and the end-to-end
 * "a suspended operator's cookie stops working" proof are covered against real Postgres by
 * {@code OperatorApprovalIT} and {@code OperatorSuspensionRevocationIT}; what neither can show
 * cheaply is the <em>order</em> of the two non-atomic effects, and what happens when one fails.
 *
 * <p>Before this slice the revoke ran only after the transition, and only because
 * {@code OperatorLifecycleOutcome.Changed} carries the username — so a transient revoke failure
 * committed the suspension, raised {@code 500}, and left the suspended operator's sessions alive
 * with the admin's retry drawing {@code 409 WRONG_STATUS}. The fix pre-reads the username through
 * {@link OperatorLifecycle#activeUsername} and revokes on <em>both</em> sides (D-1).
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}). Docker-free. Every request
 * carries a unique {@code X-Forwarded-For} (rate-bucket isolation) — this surface has no bucket
 * today, and the header keeps that from becoming a full-suite-only surprise if one is ever added.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AdminOperatorControllerTest {

	private static final String SUSPEND = "/api/admin/operators/{id}/suspend";
	private static final String REINSTATE = "/api/admin/operators/{id}/reinstate";
	private static final String APPROVE = "/api/admin/operators/{id}/approve";
	private static final String REJECT = "/api/admin/operators/{id}/reject";
	private static final String ADMIN_USERNAME = "operator";
	private static final String TARGET_USERNAME = "adriatica";
	/** {@code WebSliceStubs#operatorDirectory} resolves every principal to id 1 — so the admin is 1. */
	private static final OperatorId ADMIN = new OperatorId(1);
	private static final OperatorId TARGET = new OperatorId(2);

	@Autowired
	MockMvc mvc;

	@MockitoBean
	OperatorLifecycle lifecycle;

	@MockitoBean
	PrincipalSessionRevoker sessionRevoker;

	/** Overrides {@link WebSliceStubs}' inert no-op so the approval mail is observable. */
	@MockitoBean
	MailSender mails;

	/**
	 * The revoke must run <strong>before</strong> the status transition commits. Ordered the other
	 * way, a transient failure in the revoke is raised after the operator is already
	 * SUSPENDED — so the admin is told the suspension failed, the retry is refused
	 * {@code 409 WRONG_STATUS}, and the suspended operator keeps working until its session expires. That
	 * is a security hole, not just a bad message, and nothing surfaces it.
	 */
	@Test
	void revokesTheOperatorsSessionsBeforeTheSuspensionCommits() throws Exception {
		givenTheTargetIsActive();

		mvc.perform(isolated(post(SUSPEND, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, lifecycle);
		effects.verify(sessionRevoker).revokeAll(TARGET_USERNAME);
		effects.verify(lifecycle).suspend(TARGET);
	}

	/**
	 * The other half of the bracket (D-1): revoking only first would open a window in which the
	 * account is still ACTIVE, so the operator being suspended could sign in again and keep that session
	 * indefinitely — with no admin recovery path, since a second suspend is {@code 409 WRONG_STATUS} and
	 * revokes nothing. The trailing revoke this surface already had closes it, so it is kept rather than moved.
	 */
	@Test
	void revokesAgainAfterTheSuspensionCommits() throws Exception {
		givenTheTargetIsActive();

		mvc.perform(isolated(post(SUSPEND, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, lifecycle, sessionRevoker);
		effects.verify(sessionRevoker).revokeAll(TARGET_USERNAME);
		effects.verify(lifecycle).suspend(TARGET);
		effects.verify(sessionRevoker).revokeAll(TARGET_USERNAME);
		verify(sessionRevoker, times(2)).revokeAll(TARGET_USERNAME);
	}

	/** The failure direction the ordering buys: a revoke that fails must leave the operator ACTIVE. */
	@Test
	void aFailedRevokeNeverSuspends() {
		givenTheTargetIsActive();
		doThrow(new DataAccessResourceFailureException("connection reset"))
				.when(sessionRevoker).revokeAll(anyString());

		assertThatThrownBy(() -> mvc.perform(isolated(post(SUSPEND, TARGET.value()))
				.with(user(ADMIN_USERNAME).roles("ADMIN"))))
				.hasRootCauseInstanceOf(DataAccessResourceFailureException.class);

		verify(lifecycle, never()).suspend(any());
	}

	/**
	 * A target that is unknown or not ACTIVE has no sessions worth revoking and no username to revoke
	 * them by — the pre-read is empty, the transition still runs, and its rejection is unchanged.
	 */
	@Test
	void anUnknownOrNotActiveTargetRevokesNothing() throws Exception {
		when(lifecycle.activeUsername(TARGET)).thenReturn(Optional.empty());
		when(lifecycle.suspend(TARGET)).thenReturn(new OperatorLifecycleOutcome.WrongStatus());

		mvc.perform(isolated(post(SUSPEND, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("WRONG_STATUS"));

		verify(sessionRevoker, never()).revokeAll(anyString());
	}

	/** Reinstatement restores the account, not the old cookies — it neither pre-reads nor revokes. */
	@Test
	void reinstateRevokesNothing() throws Exception {
		when(lifecycle.reinstate(TARGET))
				.thenReturn(new OperatorLifecycleOutcome.Changed(TARGET, TARGET_USERNAME));

		mvc.perform(isolated(post(REINSTATE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isNoContent());

		verify(sessionRevoker, never()).revokeAll(anyString());
		verify(lifecycle, never()).activeUsername(any());
	}

	/**
	 * The self-suspend refusal still short-circuits ahead of every effect — the pre-read added
	 * here must not become the first thing an admin's misclick does to its own account.
	 */
	@Test
	void selfSuspendIsRefusedBeforeAnyRevoke() throws Exception {
		mvc.perform(isolated(post(SUSPEND, ADMIN.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CANNOT_SUSPEND_SELF"));

		verify(lifecycle, never()).activeUsername(any());
		verify(lifecycle, never()).suspend(any());
		verify(sessionRevoker, never()).revokeAll(anyString());
	}

	/**
	 * AC-4's edge half: the mail is issued <strong>after</strong> the transition, so it cannot
	 * influence what the admin is told. The complementary half — that a dead relay is swallowed and
	 * counted rather than raised — is pinned at the chokepoint by {@code TransactionalMailServiceTest},
	 * which is where the swallow actually lives; asserting it again here by forcing
	 * {@link MailSender} to throw would only test a contract violation that cannot occur.
	 */
	@Test
	void approveMailsTheOperatorAfterTheTransition() throws Exception {
		when(lifecycle.approve(TARGET)).thenReturn(new ApprovalOutcome.Approved("owner@vala-beach.example"));

		mvc.perform(isolated(post(APPROVE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isNoContent());

		InOrder ordered = inOrder(lifecycle, mails);
		ordered.verify(lifecycle).approve(TARGET);
		ordered.verify(mails).sendOperatorApproved(eq("owner@vala-beach.example"), any());
	}

	/** An approval that did not happen mails nothing — the address only rides the winning transition. */
	@Test
	void aRefusedApprovalMailsNothing() throws Exception {
		when(lifecycle.approve(TARGET)).thenReturn(new ApprovalOutcome.NotPending());

		mvc.perform(isolated(post(APPROVE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isConflict());

		verify(mails, never()).sendOperatorApproved(anyString(), any());
	}

	/** The three wire answers are unchanged by the sealed rewrite — the parity claim, asserted. */
	@Test
	void theApprovalStatusMappingIsUnchanged() throws Exception {
		when(lifecycle.approve(TARGET)).thenReturn(new ApprovalOutcome.NotPending());
		mvc.perform(isolated(post(APPROVE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("NOT_PENDING"));

		when(lifecycle.approve(TARGET)).thenReturn(new ApprovalOutcome.NoSuchOperator());
		mvc.perform(isolated(post(APPROVE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_OPERATOR"));

		when(lifecycle.reject(TARGET)).thenReturn(new ApprovalOutcome.Rejected());
		mvc.perform(isolated(post(REJECT, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isNoContent());

		// Rejection mails nothing — the one lifecycle transition that could plausibly have grown a mail.
		verify(mails, never()).sendOperatorApproved(anyString(), any());
	}

	private void givenTheTargetIsActive() {
		when(lifecycle.activeUsername(TARGET)).thenReturn(Optional.of(TARGET_USERNAME));
		when(lifecycle.suspend(TARGET))
				.thenReturn(new OperatorLifecycleOutcome.Changed(TARGET, TARGET_USERNAME));
	}

	/** CSRF token + a unique rate-bucket client IP — the two things every request in this class needs. */
	private static MockHttpServletRequestBuilder isolated(MockHttpServletRequestBuilder request) {
		return request.with(csrf()).header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp());
	}
}
