package ai.riviera.platform;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for self-service erasure ({@code POST /api/me/erasure}, #101 [D5]) through the real filter
 * chain — the things a unit test of the controller cannot prove:
 *
 * <ol>
 * <li><strong>The CUSTOMER role gate holds for a POST</strong> (R-1): an operator session is {@code 403}
 * and an anonymous request {@code 401} — neither reaches the scrub. Without the dedicated
 * {@code POST /api/me/erasure} matcher a POST would fall through to {@code anyRequest().authenticated()}.</li>
 * <li><strong>The happy path</strong> (AC-3): a signed-in CUSTOMER gets {@code 204}, the scrub runs for the
 * session's resolved account, and every session for the principal is revoked.</li>
 * </ol>
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}). Docker-free. The real-schema
 * scrub behaviour is {@code AccountErasureIT}'s job.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class MeErasureControllerTest {

	private static final String ERASURE = "/api/me/erasure";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	AccountErasure erasure;

	/** Replaces the inert stub so {@link CurrentCustomer} resolves the principal to an account. */
	@MockitoBean
	CustomerAccountDirectory directory;

	@MockitoBean
	PrincipalSessionRevoker sessionRevoker;

	@Test
	void signedInCustomerErasesOwnAccountAndAllSessionsAreRevoked() throws Exception {
		when(directory.accountFor("alice@example.com")).thenReturn(Optional.of(new CustomerAccountId(7)));
		when(erasure.eraseAccount(new CustomerAccountId(7))).thenReturn(EraseOutcome.ERASED);

		mvc.perform(post(ERASURE).with(user("alice@example.com").roles("CUSTOMER")).with(csrf()))
				.andExpect(status().isNoContent());

		verify(erasure).eraseAccount(new CustomerAccountId(7));
		verify(sessionRevoker).revokeAll("alice@example.com");
	}

	@Test
	void operatorSessionIsForbiddenAndNothingIsErased() throws Exception {
		mvc.perform(post(ERASURE).with(user("op").roles("OPERATOR")).with(csrf()))
				.andExpect(status().isForbidden());

		verify(erasure, never()).eraseAccount(any());
		verify(sessionRevoker, never()).revokeAll(any());
	}

	@Test
	void anonymousIsUnauthorizedAndNothingIsErased() throws Exception {
		mvc.perform(post(ERASURE).with(csrf()))
				.andExpect(status().isUnauthorized());

		verify(erasure, never()).eraseAccount(any());
	}
}
