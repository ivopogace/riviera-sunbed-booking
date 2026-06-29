package ai.riviera.platform.customer.api;

/**
 * The {@code customer} module's published port (invariant #11) — the one seam for turning a
 * {@link GuestContact} into a stable {@link CustomerId}. A deep module: this single method
 * hides email normalisation and the find-or-create upsert behind one call. Consumed by the
 * {@code booking} module (U3) when creating a booking.
 */
public interface CustomerDirectory {

	/**
	 * Return the id of the customer with this contact's email, creating one if none exists.
	 * Matching is by normalised (lower-cased, trimmed) email — guest checkout has no
	 * accounts, so email is the identity. On a repeat email the stored name/phone are
	 * refreshed to the latest supplied values and the same id is returned (idempotent).
	 */
	CustomerId findOrCreate(GuestContact contact);
}
