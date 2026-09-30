package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** A session is only ever established for a stamped {@link SessionPrincipal} (#1306). */
class SessionAuthenticationTest {

	@Test
	void anUnstampedPrincipalIsNeverStoredInASession() {
		var authorities = AuthorityUtils.createAuthorityList("ROLE_OPERATOR");
		MockHttpServletRequest request = new MockHttpServletRequest();

		assertThrows(IllegalArgumentException.class, () -> SessionAuthentication.establish(
				new HttpSessionSecurityContextRepository(),
				UsernamePasswordAuthenticationToken.authenticated(new User("someone", "", authorities), null, authorities),
				request, new MockHttpServletResponse()));
		assertNull(request.getSession(false));
	}
}
