package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The edge half of the customer role gate: only a {@code ROLE_CUSTOMER} principal is a customer. */
class CustomerPrincipalTest {

	@Test
	void aCustomerSessionIsACustomer() {
		Authentication customer = session("alice@example.com", "ROLE_CUSTOMER");

		assertTrue(CustomerPrincipal.isCustomer(customer));
		assertEquals("alice@example.com", CustomerPrincipal.name(customer));
	}

	@Test
	void anOperatorSessionNamedLikeACustomerIsNot() {
		assertFalse(CustomerPrincipal.isCustomer(session("alice@example.com", "ROLE_OPERATOR", "ROLE_ADMIN")));
	}

	@Test
	void anAnonymousRequestIsNeitherNamedNorACustomer() {
		assertFalse(CustomerPrincipal.isCustomer(null));
		assertNull(CustomerPrincipal.name(null));
	}

	private static Authentication session(String name, String... authorities) {
		return UsernamePasswordAuthenticationToken.authenticated(name, null,
				AuthorityUtils.createAuthorityList(authorities));
	}
}
