package ai.riviera.platform.customer.api;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;

/**
 * The {@code customer} module's published port (invariant #11) — the one seam for turning a
 * {@link GuestContact} into a stable {@link CustomerId}. A deep module: this single method
 * hides email normalisation and the find-or-create upsert behind one call. Consumed by the
 * {@code booking} module when creating a booking.
 */
public interface CustomerDirectory {

	/**
	 * Return the id of the customer with this contact's email, creating one if none exists.
	 * Matched by normalised (lower-cased, trimmed) email, the guest's only identity; a repeat
	 * email refreshes the stored name/phone to the latest values and returns the same id.
	 */
	CustomerId findOrCreate(GuestContact contact);
}
