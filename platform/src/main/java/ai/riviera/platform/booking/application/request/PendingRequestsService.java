package ai.riviera.platform.booking.application.request;

import java.util.List;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Serves the operator pending-requests queue (issue #98). The ownership check is the first act
 * (invariant #13) — in the application service, so no driving adapter can bypass it, mirroring
 * {@code DailyBookingsService}. Guest names resolve through the {@code customer::api} port; a
 * missing customer row (impossible via FK, defensive anyway) renders as an empty name rather
 * than failing the whole queue.
 */
@Service
class PendingRequestsService implements PendingRequests {

	private final VenueOwnership ownership;
	private final Bookings bookings;
	private final CustomerLookup customers;

	PendingRequestsService(VenueOwnership ownership, Bookings bookings, CustomerLookup customers) {
		this.ownership = ownership;
		this.bookings = bookings;
		this.customers = customers;
	}

	@Override
	public List<PendingRequest> forVenue(OperatorId operator, VenueId venueId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		return bookings.findPendingRequestsForVenue(venueId).stream()
				.map(row -> new PendingRequest(row.bookingId(), row.setId(), row.bookingDate(),
						customers.findById(row.customerId()).map(GuestContact::fullName).orElse(""),
						row.amountMinor(), row.currency(), row.requestedAt(), row.requestExpiresAt()))
				.toList();
	}
}
