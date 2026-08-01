package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.BookingRequestExpired;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The one place a pending request is terminated and its set freed (issue #98) — the request-slice
 * sibling of {@code ClaimReleaseService}, with the three terminal legs side by side so they cannot
 * drift: <strong>decline</strong> (venue said no), <strong>expire</strong> (venue never answered)
 * and <strong>withdraw</strong> (the guest retracted it — issue #123). Each is a guarded
 * {@code UPDATE … RETURNING} transition plus the
 * {@code availability.release}, committing together — a booking is never left
 * {@code DECLINED}/{@code EXPIRED}/{@code WITHDRAWN} with its set still claimed (invariant #2), and
 * the {@code RETURNING} makes a lost race (concurrent decline, withdraw, accept, or sweep) a 0-row
 * no-op, so the set is released exactly once.
 *
 * <p><strong>What makes the legs exclusive is the row lock, not the predicates.</strong> Only
 * <em>accept</em> is disjoint from expire by predicate ({@code request_expires_at > now} vs
 * {@code <= now}). Decline and withdraw are guarded on {@code status} alone — deliberately, so an
 * overdue-but-unswept request can still be declined or retracted — so on such a row their
 * {@code WHERE} clauses and expire's all match. Whichever {@code UPDATE} reaches the row first
 * commits; the others re-evaluate against the new status, match 0 rows, and release nothing.
 *
 * <p>A separate {@code @Transactional} bean (not private methods of the callers) so the
 * transaction proxy is real — the accept path stays deliberately non-transactional around its
 * Stripe call, and the sweep isolates failures per row by calling {@link #expire} once per
 * candidate. Methods public for the proxy; the class stays package-private.
 *
 * <p><strong>Decline and expire publish their fact from inside the winning leg</strong> (#124):
 * the guarded transition settles the outcome right here — unlike the accept branch, whose answer
 * arrives only after its transaction ({@code PaymentDueAnnouncer}) — so publishing on the success
 * branch makes the Event Publication Registry row commit atomically with the transition, and the
 * row-lock exclusivity above is also what guarantees a booking at most one terminal fact.
 */
@Service
class RequestReleaseService {

	private final Bookings bookings;
	private final AvailabilityClaim availability;
	private final ApplicationEventPublisher events;

	RequestReleaseService(Bookings bookings, AvailabilityClaim availability,
			ApplicationEventPublisher events) {
		this.bookings = bookings;
		this.availability = availability;
		this.events = events;
	}

	@Transactional
	public boolean decline(BookingId bookingId, VenueId venueId) {
		return bookings.declinePending(bookingId.value(), venueId)
				.map(claim -> {
					availability.release(claim.setId(), claim.bookingDate());
					events.publishEvent(new BookingRequestDeclined(bookingId, claim.setId(),
							claim.bookingDate()));
					return true;
				})
				.orElse(false);
	}

	@Transactional
	public boolean expire(BookingId bookingId, Instant now) {
		return bookings.expirePendingRequest(bookingId.value(), now)
				.map(claim -> {
					availability.release(claim.setId(), claim.bookingDate());
					events.publishEvent(new BookingRequestExpired(bookingId, claim.setId(),
							claim.bookingDate()));
					return true;
				})
				.orElse(false);
	}

	/**
	 * The guest's own retraction (issue #123) — the third terminal leg, structurally identical to the
	 * two above and guarded, like decline, on {@code status} alone. That is the opposite of disjoint:
	 * on an overdue row its {@code WHERE} and expire's both match, and the row lock is what leaves
	 * exactly one winner (see the class javadoc).
	 *
	 * <p>Two deliberate asymmetries. It is keyed on the booking <strong>code</strong>, because the
	 * guest authorizes by bearer credential rather than by venue scope; and it therefore
	 * <strong>returns</strong> the booking id, which decline and expire are already given by their
	 * caller — so the caller can log which booking ended without logging the code (invariant #7).
	 *
	 * <p>And a third, now its siblings publish (#124): this leg raises <strong>no</strong> event,
	 * deliberately — the guest retracted the request themselves, so there is no outcome to mail
	 * them (#123). Do not "complete the set"; {@code RequestTerminationEventPublicationIT} pins it.
	 */
	@Transactional
	public Optional<BookingId> withdraw(String code) {
		return bookings.withdrawPendingRequest(code)
				.map(withdrawn -> {
					availability.release(withdrawn.setId(), withdrawn.bookingDate());
					return new BookingId(withdrawn.bookingId());
				});
	}
}
