package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for admin data-subject erasure ({@code POST /api/admin/erasure}, #101 [D5]) through the real
 * filter chain:
 *
 * <ol>
 * <li><strong>ADMIN role gate</strong> (AC-5): an ADMIN succeeds; an OPERATOR / CUSTOMER is {@code 403}; an
 * anonymous request {@code 401} — none reaches the scrub.</li>
 * <li><strong>Happy path</strong> (AC-4): a valid email is {@code 204} and drives {@code eraseByEmail}.</li>
 * <li><strong>Error contract</strong> (AC-8): a blank email is {@code 400} RFC-7807 with a stable
 * {@code code}, and never touches the scrub.</li>
 * </ol>
 *
 * <p>Docker-free {@code @WebMvcTest} slice (the {@code MyVenuesControllerTest} pattern). Real-schema scrub
 * behaviour is {@code AccountErasureIT}'s job.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AdminErasureControllerTest {

	private static final String ERASURE = "/api/admin/erasure";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	AccountErasure erasure;

	@Test
	void adminErasesADataSubjectByEmail() throws Exception {
		when(erasure.eraseByEmail("dana@example.com")).thenReturn(EraseOutcome.ERASED);

		mvc.perform(post(ERASURE).with(user("admin").roles("ADMIN")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"dana@example.com\"}"))
				.andExpect(status().isNoContent());

		verify(erasure).eraseByEmail("dana@example.com");
	}

	@Test
	void blankEmailIsRejectedWithProblemDetailAndNoScrub() throws Exception {
		mvc.perform(post(ERASURE).with(user("admin").roles("ADMIN")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"   \"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(erasure, never()).eraseByEmail(any());
	}

	@Test
	void operatorAndCustomerSessionsAreForbidden() throws Exception {
		mvc.perform(post(ERASURE).with(user("op").roles("OPERATOR")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"x@example.com\"}"))
				.andExpect(status().isForbidden());
		mvc.perform(post(ERASURE).with(user("t@example.com").roles("CUSTOMER")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"x@example.com\"}"))
				.andExpect(status().isForbidden());

		verify(erasure, never()).eraseByEmail(any());
	}

	@Test
	void anonymousIsUnauthorized() throws Exception {
		mvc.perform(post(ERASURE).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"x@example.com\"}"))
				.andExpect(status().isUnauthorized());

		verify(erasure, never()).eraseByEmail(any());
	}
}
