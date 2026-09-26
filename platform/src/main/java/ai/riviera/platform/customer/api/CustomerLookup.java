package ai.riviera.platform.customer.api;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;

/**
 * The read side of the guest-identity conversation, split from {@link CustomerDirectory} by
 * consumer role: resolve a stored {@link CustomerId} back to its contact.
 * Lets the operator pending-requests queue show who is asking without the
 * {@code booking} module reading customer tables (invariant #11).
 */
public interface CustomerLookup {

	/** The stored contact for a customer id, or empty if unknown. */
	Optional<GuestContact> findById(CustomerId id);

	/**
	 * The stored contacts for a batch of customer ids, keyed by id; unknown ids are simply absent
	 * from the map. One query where {@link #findById} in a loop would be N — the operator
	 * pending-requests queue resolves every row's guest name through a single call.
	 */
	Map<CustomerId, GuestContact> findByIds(Collection<CustomerId> ids);

	/**
	 * The id of the guest contact with this email (canonical form, applied in the adapter), or
	 * empty. The <strong>read-only</strong> counterpart of {@link CustomerDirectory#findOrCreate}:
	 * an admin search must never create the guest it looks for.
	 */
	Optional<CustomerId> findByEmail(String email);
}
