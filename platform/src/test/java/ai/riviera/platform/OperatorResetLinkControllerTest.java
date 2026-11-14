package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.auth.adapter.out.PrincipalSessionRevoker;
import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.api.OperatorPasswordReset;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorResetOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;
import ai.riviera.platform.operator.vocabulary.ResetLinkOutcome;
import ai.riviera.platform.web.adapter.in.SecurityConfig;
import ai.riviera.platform.web.adapter.in.WebCorsConfig;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin-issued operator reset's edge (#1737): what the issue endpoint answers and hands {@code operator},
 * and the redemption's revoke bracket. The storage rules are {@code OperatorPasswordResetStoreIT}'s; the end
 * to end flow with real sessions is {@code OperatorPasswordResetIT}'s.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class OperatorResetLinkControllerTest {

	private static final String ISSUE = "/api/admin/operators/{id}/reset-link";
	private static final String REDEEM = "/api/auth/operator/reset-password";
	private static final String ADMIN_USERNAME = "admin-two";
	private static final String BOOTSTRAP_USERNAME = "operator";
	private static final String TARGET_USERNAME = "adriatica";
	private static final OperatorId TARGET = new OperatorId(2);
	private static final String NEW_PASSWORD = "a-brand-new-passphrase";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	OperatorLifecycle lifecycle;

	@MockitoBean
	OperatorPasswordReset passwordReset;

	@MockitoBean
	PrincipalSessionRevoker sessionRevoker;

	@Test
	void anIssuedLinkAnswersTheRawTokenAndStoresOnlyItsDigest() throws Exception {
		when(lifecycle.usernameInStatus(TARGET, OperatorStatus.ACTIVE)).thenReturn(Optional.of(TARGET_USERNAME));
		when(passwordReset.issue(eq(TARGET), anyString(), any())).thenReturn(new ResetLinkOutcome.Issued());

		MvcResult result = mvc.perform(isolated(post(ISSUE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.expiresAt").exists())
				.andReturn();

		String token = JsonPath.read(result.getResponse().getContentAsString(), "$.token");
		ArgumentCaptor<String> storedHash = ArgumentCaptor.forClass(String.class);
		verify(passwordReset).issue(eq(TARGET), storedHash.capture(), any());
		assertEquals(sha256(token), storedHash.getValue());
		assertTrue(token.length() >= 43, "256 bits, URL-safe base64");
		assertTrue(result.getResponse().getHeader("Cache-Control").contains("no-store"));
	}

	@Test
	void theBootstrapAdminIsRefusedBeforeAnyTokenIsStored() throws Exception {
		when(lifecycle.usernameInStatus(TARGET, OperatorStatus.ACTIVE)).thenReturn(Optional.of(BOOTSTRAP_USERNAME));

		mvc.perform(isolated(post(ISSUE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BOOTSTRAP_CREDENTIAL_MANAGED"));

		verify(passwordReset, never()).issue(any(), anyString(), any());
	}

	@Test
	void aNonActiveOrUnknownTargetIsRefused() throws Exception {
		when(passwordReset.issue(eq(TARGET), anyString(), any())).thenReturn(new ResetLinkOutcome.NotActive());
		mvc.perform(isolated(post(ISSUE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("WRONG_STATUS"))
				.andExpect(jsonPath("$.token").doesNotExist());

		when(passwordReset.issue(eq(TARGET), anyString(), any())).thenReturn(new ResetLinkOutcome.NoSuchOperator());
		mvc.perform(isolated(post(ISSUE, TARGET.value())).with(user(ADMIN_USERNAME).roles("ADMIN")))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_OPERATOR"));
	}

	@Test
	void aPlainOperatorCannotIssueALink() throws Exception {
		mvc.perform(isolated(post(ISSUE, TARGET.value())).with(user(TARGET_USERNAME).roles("OPERATOR")))
				.andExpect(status().isForbidden());

		verify(passwordReset, never()).issue(any(), anyString(), any());
	}

	@Test
	void aRedemptionRevokesTheOperatorsSessionsBeforeAndAfterTheWrite() throws Exception {
		when(passwordReset.usernameForResetToken(anyString())).thenReturn(Optional.of(TARGET_USERNAME));
		when(passwordReset.resetPassword(anyString(), anyString()))
				.thenReturn(new OperatorResetOutcome.Reset(TARGET_USERNAME));

		mvc.perform(redeem("raw-token")).andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, passwordReset, sessionRevoker);
		effects.verify(sessionRevoker).revokeAll(TARGET_USERNAME);
		effects.verify(passwordReset).resetPassword(eq(sha256("raw-token")), anyString());
		effects.verify(sessionRevoker).revokeAll(TARGET_USERNAME);
	}

	@Test
	void aRefusedTokenRevokesNothingAndAnswersOneCode() throws Exception {
		when(passwordReset.usernameForResetToken(anyString())).thenReturn(Optional.empty());
		when(passwordReset.resetPassword(anyString(), anyString()))
				.thenReturn(new OperatorResetOutcome.InvalidOrExpired());

		mvc.perform(redeem("dead-token"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_OR_EXPIRED_TOKEN"));

		verify(sessionRevoker, never()).revokeAll(anyString());
	}

	@Test
	void aPasswordNamingTheOperatorIsRefusedBeforeAnyRevoke() throws Exception {
		when(passwordReset.usernameForResetToken(anyString())).thenReturn(Optional.of(TARGET_USERNAME));

		mvc.perform(redeem("raw-token", "my-" + TARGET_USERNAME + "-password"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PASSWORD_CONTAINS_BLOCKED_TERM"));

		verify(sessionRevoker, never()).revokeAll(anyString());
		verify(passwordReset, never()).resetPassword(anyString(), anyString());
	}

	private static MockHttpServletRequestBuilder redeem(String token) {
		return redeem(token, NEW_PASSWORD);
	}

	private static MockHttpServletRequestBuilder redeem(String token, String newPassword) {
		return isolated(post(REDEEM))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"token\":\"" + token + "\",\"newPassword\":\"" + newPassword + "\"}");
	}

	private static MockHttpServletRequestBuilder isolated(MockHttpServletRequestBuilder request) {
		return request.with(csrf()).header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp());
	}

	private static String sha256(String raw) throws Exception {
		return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
	}
}
