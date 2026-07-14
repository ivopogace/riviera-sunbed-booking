package ai.riviera.platform;

import java.util.Optional;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * Edge glue that resolves the authenticated principal to its {@link CustomerAccountId} (S3, epic #108) —
 * the customer-side sibling of {@link CurrentOperator}. Reading the Spring Security context is a
 * platform/edge concern (RV-BE-11), not {@code customer} domain: the module only maps an email to an id
 * via {@link CustomerAccountDirectory}. It lives in the application root alongside {@code SecurityConfig},
 * not inside any module.
 *
 * <p>Two entry points for the two call sites (invariant #13 posture — authorization is by the session
 * principal, never a request-supplied id):
 * <ul>
 * <li>{@link #optional} for the <strong>guest-tolerant</strong> checkout path: a signed-in customer
 *     links the booking; an anonymous or operator principal simply gets empty (a guest booking).</li>
 * <li>{@link #require} for the <strong>customer-only</strong> my-bookings path: no customer principal
 *     is an {@link AccessDeniedException} (→ 403 via {@link ApiErrorHandler}).</li>
 * </ul>
 * A non-customer principal (anonymous, or an operator with {@code ROLE_OPERATOR}) never carries
 * {@code ROLE_CUSTOMER}, so it can never resolve to an account here — an operator session lists no
 * customer's bookings.
 */
@Component
public class CurrentCustomer {

	/** The authority every customer principal carries (Spring prefixes the {@code CUSTOMER} role). */
	static final String ROLE_CUSTOMER = "ROLE_CUSTOMER";

	private final CustomerAccountDirectory directory;

	CurrentCustomer(CustomerAccountDirectory directory) {
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
