package ai.riviera.platform;

import org.springframework.security.core.Authentication;

/**
 * Reads the session principal for {@code customer::api}'s directory, which never sees a Spring Security
 * type: the principal's name, and whether it holds the customer role. An operator session named like a
 * customer's email must never act as that customer (the invariant #13 posture).
 * Twin of {@code booking.adapter.in.CustomerPrincipal}.
 */
final class CustomerPrincipal {

	/** The authority every customer principal carries ({@link CustomerUserDetailsService} grants it). */
	private static final String ROLE_CUSTOMER = "ROLE_" + CustomerUserDetailsService.CUSTOMER_ROLE;

	private CustomerPrincipal() {
	}

	/** The principal's name, or {@code null} for an anonymous request. */
	static String name(Authentication authentication) {
		return authentication == null ? null : authentication.getName();
	}

	/** Whether the principal holds {@code ROLE_CUSTOMER}; {@code false} for an anonymous request. */
	static boolean isCustomer(Authentication authentication) {
		return authentication != null && authentication.getAuthorities().stream()
				.anyMatch(granted -> ROLE_CUSTOMER.equals(granted.getAuthority()));
	}
}
