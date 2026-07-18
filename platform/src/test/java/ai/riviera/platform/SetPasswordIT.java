package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S8 (#113, AC-5) authenticated set-password — closes the S4 F-1 gap. An SSO-only (password-less)
 * account sets its first password from within its own session (its SSO email is provider-verified), then
 * can password-login. An account that already has a password must supply the correct current one; a
 * missing/wrong current password is {@code 400 INVALID_CURRENT_PASSWORD}, and the stored password is
 * unchanged. The signed-in principal is faked with {@code user(email).roles("CUSTOMER")} so the SSO-only
 * case (which cannot password-login) can still be driven; {@code CurrentCustomer} resolves it to the real
 * DB account by email. Never a register-time UPSERT.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class SetPasswordIT {

	private static final String SET_PASSWORD_PATH = "/api/me/password";
	private static final String LOGIN_PATH = "/api/auth/customer/login";

	@Autowired
	MockMvc mvc;
	@Autowired
	SsoAccountProvisioning sso;

	// No DB cleanup: unique emails against a fresh Testcontainers DB (deleting accounts would trip the
	// customer_sso_identity FK), the SsoAccountProvisioningIT pattern.

	@Test
	void ssoOnlyAccountSetsFirstPasswordThenCanLogin() throws Exception {
		String email = "setpw-it-sso@example.com";
		sso.resolveOrCreate(SsoProvider.GOOGLE, "setpw-it-sub", email);
		login(email, "before-any-password").andExpect(status().isUnauthorized()); // no local password yet

		setPassword(email, """
				{"newPassword": "brandnewpass1"}""") // no current password required for an SSO-only account
				.andExpect(status().isNoContent());

		login(email, "brandnewpass1").andExpect(status().isOk()); // first password set — F-1 closed
	}

	@Test
	void existingPasswordAccountRequiresTheCorrectCurrentPassword() throws Exception {
		String email = "setpw-it-pw@example.com";
		register(email, "originalpass1");

		setPassword(email, """
				{"newPassword": "changedpass2", "currentPassword": "the-wrong-one"}""")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));
		setPassword(email, """
				{"newPassword": "changedpass2"}""") // missing current password on an account that has one
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));
		login(email, "originalpass1").andExpect(status().isOk()); // unchanged

		setPassword(email, """
				{"newPassword": "changedpass2", "currentPassword": "originalpass1"}""")
				.andExpect(status().isNoContent());
		login(email, "originalpass1").andExpect(status().isUnauthorized()); // old gone
		login(email, "changedpass2").andExpect(status().isOk());             // new works
	}

	private ResultActions setPassword(String email, String jsonBody) throws Exception {
		return mvc.perform(post(SET_PASSWORD_PATH).with(user(email).roles("CUSTOMER")).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content(jsonBody));
	}

	private void register(String email, String password) throws Exception {
		mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)))
				.andExpect(status().isCreated());
	}

	private ResultActions login(String email, String password) throws Exception {
		return mvc.perform(post(LOGIN_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)));
	}
}
