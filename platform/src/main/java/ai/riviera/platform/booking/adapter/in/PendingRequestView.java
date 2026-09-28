package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.booking.application.request.PendingRequest;
import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * One item of the operator queue response, tagged by {@code kind}: a {@code BOOKING} answered by
 * {@code bookingId} or a {@code STAY} answered whole by {@code stayId} (#1267). Id-based, <strong>no
 * booking code</strong> (invariant #7); money as {@link MoneyView} (#5); dates ISO, the whole span the
 * amount covers; instants ISO-8601 UTC (#6).
 */
sealed interface PendingRequestView {

	String BOOKING = "BOOKING";
	String STAY = "STAY";

	record Lone(String kind, long bookingId, long setId, String bookingDate, String lastDate, String guestName,
			MoneyView amount, Instant requestedAt, Instant requestExpiresAt, int competingRequests)
			implements PendingRequestView {
	}

	record Stay(String kind, long stayId, String guestName, String firstDate, String lastDate, MoneyView total,
			Instant requestedAt, Instant requestExpiresAt, int competingRequests, List<Stop> stops)
			implements PendingRequestView {
	}

	record Stop(long setId, String firstDate, String lastDate, MoneyView amount, int competingRequests) {
	}

	static PendingRequestView of(PendingRequest request) {
		return switch (request) {
			case PendingRequest.Lone lone -> new Lone(BOOKING, lone.bookingId(), lone.setId().value(),
					lone.bookingDate().toString(), lone.lastDate().toString(), lone.guestName(),
					new MoneyView(lone.amountMinor(), lone.currency()), lone.requestedAt(), lone.requestExpiresAt(),
					lone.competingRequests());
			case PendingRequest.Stay stay -> new Stay(STAY, stay.stayId().value(), stay.guestName(),
					stay.firstDate().toString(), stay.lastDate().toString(),
					new MoneyView(stay.amountMinor(), stay.currency()), stay.requestedAt(), stay.requestExpiresAt(),
					stay.competingRequests(), stay.stops().stream()
							.map(stop -> new Stop(stop.setId().value(), stop.firstDate().toString(),
									stop.lastDate().toString(), new MoneyView(stop.amountMinor(), stay.currency()),
									stop.competingRequests()))
							.toList());
		};
	}
}
