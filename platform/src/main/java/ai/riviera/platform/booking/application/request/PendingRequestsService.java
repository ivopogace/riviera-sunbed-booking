package ai.riviera.platform.booking.application.request;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Serves the operator pending-requests queue, a stay's stretches folded into one item (#1267). The
 * ownership check is the first act (invariant #13), mirroring {@code DailyBookingsService}. Guest names
 * resolve through {@code customer::api} in one batch call ({@code findByIds}, never one lookup per row);
 * a missing customer row (impossible via FK) renders as an empty name rather than failing the queue.
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
		List<PendingRequestRow> rows = bookings.findPendingRequestsForVenue(venueId);
		if (rows.isEmpty()) {
			return List.of();
		}
		Set<CustomerId> ids =
				rows.stream().map(PendingRequestRow::customerId).collect(Collectors.toSet());
		Map<CustomerId, GuestContact> contacts = customers.findByIds(ids);
		Map<RequestKey, List<PendingRequestRow>> requests = new LinkedHashMap<>();
		for (PendingRequestRow row : rows) {
			requests.computeIfAbsent(RequestKey.of(row), k -> new ArrayList<>()).add(row);
		}
		return requests.values().stream().map(request -> itemOf(request, contacts)).toList();
	}

	private static PendingRequest itemOf(List<PendingRequestRow> request, Map<CustomerId, GuestContact> contacts) {
		PendingRequestRow first = request.getFirst();
		String guestName = guestName(contacts, first.customerId());
		StayId stayId = first.stayId();
		if (stayId == null) {
			return new PendingRequest.Lone(first.bookingId(), first.setId(), first.bookingDate(), first.lastDate(),
					guestName, first.amountMinor(), first.currency(), first.requestedAt(), first.requestExpiresAt(),
					first.competingRequests());
		}
		List<PendingRequest.Stop> stops = request.stream()
				.sorted(Comparator.comparing(PendingRequestRow::bookingDate))
				.map(row -> new PendingRequest.Stop(row.setId(), row.bookingDate(), row.lastDate(), row.amountMinor(),
						row.competingRequests()))
				.toList();
		return new PendingRequest.Stay(stayId, guestName, stops, first.currency(), first.requestedAt(),
				first.requestExpiresAt(), first.stayCompetingRequests());
	}

	/** A stay's stretches share its key; a lone request is keyed by its own booking. */
	private record RequestKey(StayId stayId, long bookingId) {

		static RequestKey of(PendingRequestRow row) {
			return row.stayId() != null ? new RequestKey(row.stayId(), 0L) : new RequestKey(null, row.bookingId());
		}
	}

	private static String guestName(Map<CustomerId, GuestContact> contacts, CustomerId id) {
		GuestContact contact = contacts.get(id);
		return contact == null ? "" : contact.fullName();
	}
}
