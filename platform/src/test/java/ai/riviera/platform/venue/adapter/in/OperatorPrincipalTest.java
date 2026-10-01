package ai.riviera.platform.venue.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The edge half of the photo preview bypass: only an operator principal is an operator, only an admin an admin. */
class OperatorPrincipalTest {

	@Test
	void anOperatorSessionIsAnOperator() {
		assertTrue(OperatorPrincipal.isOperator(principal("op", "ROLE_OPERATOR")));
	}

	@Test
	void aCustomerNamedLikeAnOperatorIsNot() {
		assertFalse(OperatorPrincipal.isOperator(principal("op", "ROLE_CUSTOMER")));
		assertFalse(OperatorPrincipal.isOperator(null));
	}

	@Test
	void onlyTheAdminAuthorityIsAdmin() {
		assertTrue(OperatorPrincipal.isAdmin(principal("op", "ROLE_OPERATOR", "ROLE_ADMIN")));
		assertFalse(OperatorPrincipal.isAdmin(principal("op", "ROLE_OPERATOR")));
		assertFalse(OperatorPrincipal.isAdmin(null));
	}

	private static Authentication principal(String username, String... authorities) {
		return UsernamePasswordAuthenticationToken.authenticated(username, null,
				AuthorityUtils.createAuthorityList(authorities));
	}
}
