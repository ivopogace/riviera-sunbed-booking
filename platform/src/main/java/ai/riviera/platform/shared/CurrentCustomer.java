package ai.riviera.platform.shared;

import java.util.Optional;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * Edge glue resolving the authenticated principal to its {@link CustomerAccountId}; the
 * customer-side {@link CurrentOperator}. Authorization rests on the session principal, never a
 * request-supplied id (the invariant #13 posture). Only a {@code ROLE_CUSTOMER} principal resolves,
 * so an operator session lists no customer's bookings. Reading the security context is the edge's
 * job (RV-BE-11); {@code customer} only maps an email to an id. Why {@code shared}, not the root:
 * {@code RESPONSIBILITIES.md} §{@code shared}.
 */
@Component
public class CurrentCustomer {

	/** The authority every customer principal carries (Spring prefixes the {@code CUSTOMER} role). */
	static final String ROLE_CUSTOMER = "ROLE_CUSTOMER";

	private final CustomerAccountDirectory directory;

	public CurrentCustomer(CustomerAccountDirectory directory) {
		this.directory = directory;
	}

	/**
	 * The signed-in customer's account id, or empty for a guest / anonymous / operator principal.
	 * Used by the checkout path, where signed-out is the normal guest case, not an error.
	 */
	public Optional<CustomerAccountId> optional(Authentication authentication) {
		if (authentication == null) {
			return Optional.empty();
		}
		boolean isCustomer = authentication.getAuthorities().stream()
				.anyMatch(a -> ROLE_CUSTOMER.equals(a.getAuthority()));
		if (!isCustomer) {
			return Optional.empty();
		}
		return directory.accountFor(authentication.getName());
	}

	/** The current customer's account id, or {@link AccessDeniedException} (→ 403) if the principal is not a customer. */
	public CustomerAccountId require(Authentication authentication) {
		return optional(authentication)
				.orElseThrow(() -> new AccessDeniedException("not an authenticated customer"));
	}
}
