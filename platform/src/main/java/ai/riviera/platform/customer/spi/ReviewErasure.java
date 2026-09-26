package ai.riviera.platform.customer.spi;

import java.util.Collection;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The one scrub {@code customer}'s erasure cannot do on its own tables: a subject's review display
 * names and comments, which hang off bookings. Called by both erasure paths and the retention sweep
 * <em>inside</em> their transaction, so a scrubbed contact and a still-named review never commit apart
 * (ADR-0010). Driven port (invariant #11) implemented by {@code booking}, which alone can resolve a
 * subject to bookings and reach {@code review}; {@code customer} imports neither, as with
 * {@link GuestBookingHistory}. The review keeps its star: {@code RESPONSIBILITIES.md} §review.
 */
public interface ReviewErasure {

	/**
	 * Tombstone every review of these guest contacts' bookings (name and comment blanked, star kept);
	 * returns how many changed. Idempotent: already-tombstoned reviews are not counted again.
	 * {@code guests} is never empty; the caller skips the call instead.
	 */
	int eraseForGuests(Collection<CustomerId> guests);

	/**
	 * As {@link #eraseForGuests} for the bookings made under this account. Self-service calls it by id
	 * on every erasure, so a review written after an earlier erasure is caught by the next; the admin
	 * path finds the account by live email, so once tombstoned it is out of reach there.
	 */
	int eraseForAccount(CustomerAccountId account);
}
