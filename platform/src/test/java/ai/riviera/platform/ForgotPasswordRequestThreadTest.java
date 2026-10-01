package ai.riviera.platform;

import java.net.URI;
import java.util.Optional;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.CustomerAccountRecovery;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.notification.api.MailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Forgot-password's request-thread work per branch (D-8 timing, #1336), recorded rather than timed: a
 * known and an unknown email each make the one account read and touch the token store not at all, and
 * answer the same {@code 204}. The known branch hands the send port a deferred link that issues the token
 * only when the off-thread task resolves it. The real {@code CustomerRecovery} runs over the doubles;
 * the challenge is off here, as {@code ChallengeVerificationFilterTest} owns the fence.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = "riviera.altcha.enabled=false")
class ForgotPasswordRequestThreadTest {

	private static final String FORGOT_PASSWORD = "/api/auth/customer/forgot-password";
	private static final String KNOWN = "known@example.com";
	private static final String UNKNOWN = "unknown@example.com";
	private static final CustomerAccountId ACCOUNT = new CustomerAccountId(7);

	@Autowired
	MockMvc mvc;

	@MockitoBean
	CustomerAccountDirectory directory;

	@MockitoBean
	CustomerAccountRecovery tokenStore;

	@MockitoBean
	MailSender mails;

	@Test
	void aKnownEmailMakesOneReadAndIssuesNothingOnTheRequestThread() throws Exception {
		when(directory.accountFor(KNOWN)).thenReturn(Optional.of(ACCOUNT));

		forgot(KNOWN);

		verify(directory).accountFor(KNOWN);
		verifyNoMoreInteractions(directory);
		verifyNoInteractions(tokenStore);
		verify(mails).sendPasswordReset(eq(KNOWN), any());
	}

	@Test
	void anUnknownEmailMakesTheSameOneReadAndDispatchesNothing() throws Exception {
		when(directory.accountFor(UNKNOWN)).thenReturn(Optional.empty());

		forgot(UNKNOWN);

		verify(directory).accountFor(UNKNOWN);
		verifyNoMoreInteractions(directory);
		verifyNoInteractions(tokenStore, mails);
	}

	@Test
	void bothBranchesAnswerTheSameEmpty204() throws Exception {
		when(directory.accountFor(KNOWN)).thenReturn(Optional.of(ACCOUNT));
		when(directory.accountFor(UNKNOWN)).thenReturn(Optional.empty());

		MockHttpServletResponse known = forgot(KNOWN);
		MockHttpServletResponse unknown = forgot(UNKNOWN);

		assertThat(known.getStatus()).isEqualTo(204).isEqualTo(unknown.getStatus());
		assertThat(known.getContentAsByteArray()).isEmpty();
		assertThat(unknown.getContentAsByteArray()).isEmpty();
		assertThat(known.getContentType()).isEqualTo(unknown.getContentType());
	}

	/** The deferred link is where the token store is reached: on the dispatcher, after the response. */
	@Test
	@SuppressWarnings("unchecked")
	void theDeferredLinkIssuesTheTokenWhenTheDispatchedTaskResolvesIt() throws Exception {
		when(directory.accountFor(KNOWN)).thenReturn(Optional.of(ACCOUNT));
		when(tokenStore.issuePasswordResetToken(eq(ACCOUNT), any(), any())).thenReturn(true);
		forgot(KNOWN);
		ArgumentCaptor<Supplier<Optional<URI>>> deferred = ArgumentCaptor.forClass(Supplier.class);
		verify(mails).sendPasswordReset(eq(KNOWN), deferred.capture());

		assertThat(deferred.getValue().get()).isPresent();

		verify(tokenStore).issuePasswordResetToken(eq(ACCOUNT), any(), any());
	}

	private MockHttpServletResponse forgot(String email) throws Exception {
		return mvc.perform(post(FORGOT_PASSWORD).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\": \"" + email + "\"}"))
				.andReturn()
				.getResponse();
	}
}
