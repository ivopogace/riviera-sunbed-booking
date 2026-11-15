package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.operator.api.OperatorLanguage;
import ai.riviera.platform.shared.SiteLocale;
import ai.riviera.platform.web.adapter.in.SecurityConfig;
import ai.riviera.platform.web.adapter.in.WebCorsConfig;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The signed-in operator's own language — {@code PUT /api/auth/operator/locale} (#1785). Operator-only at the
 * chain: the write is keyed on the principal's name, so a customer session is refused before any handler is
 * selected ({@link MvcResult#getHandler()}, as {@code MeSurfaceRoleGateTest} explains). Only a served
 * locale's code is stored; anything else is {@code 400 INVALID_REQUEST} with nothing written.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class OperatorLanguageControllerTest {

	private static final String LOCALE_PATH = "/api/auth/operator/locale";
	private static final String OPERATOR_USERNAME = "adriatica";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	OperatorLanguage language;

	@Test
	void storesTheSignedInOperatorsPick() throws Exception {
		mvc.perform(request("{\"locale\":\"sq\"}").with(user(OPERATOR_USERNAME).roles("OPERATOR")))
				.andExpect(status().isNoContent());

		verify(language).setLocale(OPERATOR_USERNAME, SiteLocale.SQ);
	}

	@ParameterizedTest
	@ValueSource(strings = { "{\"locale\":\"de\"}", "{\"locale\":\"SQ\"}", "{\"locale\":\"\"}", "{}" })
	void refusesAnythingButAServedLocalesCode(String body) throws Exception {
		mvc.perform(request(body).with(user(OPERATOR_USERNAME).roles("OPERATOR")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(language, never()).setLocale(any(), any());
	}

	@Test
	void anAnonymousRequestIsUnauthenticated() throws Exception {
		mvc.perform(request("{\"locale\":\"sq\"}")).andExpect(status().isUnauthorized());

		verify(language, never()).setLocale(any(), any());
	}

	@Test
	void aCustomerSessionIsRefusedAtTheChain() throws Exception {
		MvcResult result = mvc.perform(request("{\"locale\":\"sq\"}")
						.with(user("guest@example.com").roles("CUSTOMER")))
				.andExpect(status().isForbidden())
				.andReturn();

		assertNull(result.getHandler(), "refused by the role gate, before any handler");
		verify(language, never()).setLocale(any(), any());
	}

	private static MockHttpServletRequestBuilder request(String body) {
		return put(LOCALE_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body);
	}
}
