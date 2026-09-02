package ai.riviera.platform.customer.spi;

import java.util.Collection;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The one scrub the {@code customer} module's erasure cannot perform on its own tables: the
 * personal data a data subject left on their reviews — a display name and a comment, attached to
 * the subject's <em>bookings</em>, which this module never sees. Driven by both erasure paths
 * (self-service, admin-by-email) and by the retention sweep, inside their transaction, so a
 * scrubbed contact and a still-named review can never commit apart (ADR-0010).
 *
 * <p><strong>Driven (SPI) port, dependency-inverted (invariant #11).</strong> Declared here, in
 * the consumer's {@code spi} named interface, and <em>implemented by the {@code booking} module</em>
 * — the sole owner of the {@code booking} table, and the only module that can both resolve a subject
 * to bookings and reach {@code review}'s published surface. {@code customer} never imports
 * {@code booking} or {@code review}; the same shape as {@link GuestBookingHistory}.
 *
 * <p>The port answers only the <em>act</em> and its count: which subjects are erased, and when,
 * stays here. The review keeps its star — a review identifies nobody once its texts are gone, and
 * the venue's earned score is not the subject's to take back.
 */
public interface ReviewErasure {

	/**
	 * Tombstone every review of these guest contacts' bookings — display name blanked, comment
	 * deleted, star kept. Idempotent: already-tombstoned reviews are not counted again.
	 *
	 * @param guests the tombstoned guest contacts; never empty (the caller skips the call instead)
	 * @return how many reviews changed
	 */
	int eraseForGuests(Collection<CustomerId> guests);

	/**
	 * As {@link #eraseForGuests} for every review of the bookings made under this account. Reached
	 * on every erasure of the account, tombstoned or not, so a review written after an earlier
	 * erasure is scrubbed by the next one.
	 *
	 * @return how many reviews changed
	 */
	int eraseForAccount(CustomerAccountId account);
}
