package ai.riviera.platform.customer.api;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;

/**
 * The read side of the guest-identity conversation, split from {@link CustomerDirectory} by
 * consumer role (issue #94 precedent): resolve a stored {@link CustomerId} back to its contact.
 * Lets the operator pending-requests queue (issue #98) show who is asking without the
 * {@code booking} module reading customer tables (invariant #11).
 */
public interface CustomerLookup {

	/** The stored contact for a customer id, or empty if unknown. */
	Optional<GuestContact> findById(CustomerId id);
}
