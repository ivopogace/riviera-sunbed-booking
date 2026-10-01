package ai.riviera.platform.shared;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;

import ai.riviera.platform.operator.vocabulary.OperatorId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The non-throwing principal reads for {@code permitAll} paths: only an operator principal resolves. */
class CurrentOperatorTest {

	private static final OperatorId OPERATOR = new OperatorId(7L);

	private final CurrentOperator current = new CurrentOperator(
			username -> "op".equals(username) ? Optional.of(OPERATOR) : Optional.empty());

	@Test
	void anOperatorPrincipalResolvesToItsId() {
		assertEquals(Optional.of(OPERATOR), current.optional(principal("op", "ROLE_OPERATOR")));
	}

	@Test
	void aNonOperatorPrincipalResolvesToNothingEvenWhenTheNameMatches() {
		assertEquals(Optional.empty(), current.optional(principal("op", "ROLE_CUSTOMER")));
		assertEquals(Optional.empty(), current.optional(null));
	}

	@Test
	void anOperatorOutsideTheMayOperateSetResolvesToNothing() {
		assertEquals(Optional.empty(), current.optional(principal("suspended", "ROLE_OPERATOR")));
	}

	@Test
	void onlyTheAdminAuthorityIsAdmin() {
		assertTrue(current.isAdmin(principal("op", "ROLE_OPERATOR", "ROLE_ADMIN")));
		assertFalse(current.isAdmin(principal("op", "ROLE_OPERATOR")));
		assertFalse(current.isAdmin(null));
	}

	private static Authentication principal(String username, String... authorities) {
		return UsernamePasswordAuthenticationToken.authenticated(username, null,
				AuthorityUtils.createAuthorityList(authorities));
	}
}
