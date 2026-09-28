package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One item of the operator's pending-requests queue: a {@link Lone} request or a {@link Stay} request,
 * answered whole (#1267). Ids only, <strong>no booking code</strong> (invariant #7); money in integer
 * minor units (#5). {@code competingRequests}: other pending requests overlapping it on its sets, which
 * accepting it declines (ADR-0025).
 */
public sealed interface PendingRequest {

	String guestName();

	/** A request for one set over {@code bookingDate..lastDate}; accept/decline act by {@code bookingId}. */
	record Lone(long bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate, String guestName,
			long amountMinor, String currency, Instant requestedAt, Instant requestExpiresAt,
			int competingRequests) implements PendingRequest {
	}

	/** A stitched stay request: its stops in day order under one deadline; accept/decline act by {@code stayId}. */
	record Stay(StayId stayId, String guestName, List<Stop> stops, String currency, Instant requestedAt,
			Instant requestExpiresAt, int competingRequests) implements PendingRequest {

		public Stay {
			stops = List.copyOf(stops);
		}

		public LocalDate firstDate() {
			return stops.getFirst().firstDate();
		}

		public LocalDate lastDate() {
			return stops.getLast().lastDate();
		}

		public long amountMinor() {
			return stops.stream().mapToLong(Stop::amountMinor).reduce(0L, Math::addExact);
		}
	}

	/** One stop of a stay request: its set, its inclusive days, its money and the requests competing for it. */
	record Stop(SetId setId, LocalDate firstDate, LocalDate lastDate, long amountMinor, int competingRequests) {
	}
}
