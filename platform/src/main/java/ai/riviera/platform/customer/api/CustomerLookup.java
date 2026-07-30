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

	/**
	 * The id of the guest contact with this email, or empty if no contact has it (#380).
	 *
	 * <p>The <strong>read-only</strong> counterpart of {@link CustomerDirectory#findOrCreate}, and the
	 * distinction is the reason it exists: answering this question through {@code findOrCreate} would
	 * <em>write</em> a contact row, so an admin searching for an address nobody booked with would create
	 * the very guest they were looking for. Matching is on this module's canonical email form
	 * ({@code Emails.normalize}), applied inside the adapter so a caller cannot spell the rule a second
	 * way and miss rows the writer would have matched.
	 *
	 * <p>Its consumer is the admin mail-delivery view (#380), which needs an id to ask {@code booking}
	 * for that person's bookings — so the address stops here and no PII crosses into another module.
	 */
	Optional<CustomerId> findByEmail(String email);
}
