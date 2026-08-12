package ai.riviera.platform;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code MISSING_CURRENT_PASSWORD} is emitted by two controllers — the operator password change and
 * its customer twin — and the two are expected to answer one condition in one wording.
 *
 * <p>The assertion is an <strong>equality between the two live responses</strong> rather than two
 * literal matches, so editing one side alone fails here even when the new string is itself fine.
 * That is the failure this class exists for: a per-controller literal assertion passes happily
 * while the pair drifts, which is how the wording being removed got copied in the first place.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class CurrentPasswordDetailTwinTest {

	private static final String OPERATOR_PASSWORD_PATH = "/api/auth/operator/password";
	private static final String CUSTOMER_PASSWORD_PATH = "/api/me/password";
	private static final String OPERATOR_USERNAME = "adriatica";
	private static final String CUSTOMER_EMAIL = "tourist@example.com";
	private static final CustomerAccountId ACCOUNT_ID = new CustomerAccountId(42L);
	private static final String CURRENT_PASSWORD = "current-pass1";
	private static final String NEW_PASSWORD = "rotated-pass2";

	/** The current password is omitted entirely — the arm both controllers answer with the code. */
	private static final String NO_CURRENT_PASSWORD_BODY = """
			{"newPassword": "%s"}""".formatted(NEW_PASSWORD);

	@Autowired
	MockMvc mvc;

	@Autowired
	PasswordEncoder passwordEncoder;

	@MockitoBean
	OperatorAccounts operatorAccounts;

	/** Replaces the inert stub so {@code CurrentCustomer} resolves the principal to an account. */
	@MockitoBean
	CustomerAccountDirectory directory;

	@MockitoBean
	CustomerAccounts customerAccounts;

	@Test
	void bothPasswordEndpointsStateTheSameCondition() throws Exception {
		when(operatorAccounts.findByUsername(OPERATOR_USERNAME)).thenReturn(Optional.of(
				new OperatorCredential(OPERATOR_USERNAME, passwordEncoder.encode(CURRENT_PASSWORD), true, false)));
		when(directory.accountFor(CUSTOMER_EMAIL)).thenReturn(Optional.of(ACCOUNT_ID));
		when(customerAccounts.findByEmail(CUSTOMER_EMAIL)).thenReturn(Optional.of(
				new CustomerAccountCredential(CUSTOMER_EMAIL, passwordEncoder.encode(CURRENT_PASSWORD))));

		String operatorDetail = detailOf(isolated(post(OPERATOR_PASSWORD_PATH))
				.with(user(OPERATOR_USERNAME).roles("OPERATOR")));
		String customerDetail = detailOf(isolated(post(CUSTOMER_PASSWORD_PATH))
				.with(user(CUSTOMER_EMAIL).roles("CUSTOMER")));

		assertThat(operatorDetail)
				.as("the operator and customer password endpoints must not drift apart on one code")
				.isEqualTo(customerDetail);
		assertThat(operatorDetail).doesNotContain("your", "Enter");
	}

	private String detailOf(MockHttpServletRequestBuilder request) throws Exception {
		return mvc.perform(request)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"))
				.andReturn().getResponse().getContentAsString()
				.replaceAll("^.*\"detail\":\"([^\"]*)\".*$", "$1");
	}

	private static MockHttpServletRequestBuilder isolated(MockHttpServletRequestBuilder request) {
		return request.with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content(NO_CURRENT_PASSWORD_BODY);
	}
}
