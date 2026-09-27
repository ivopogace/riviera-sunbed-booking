package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * What a stitched stay's confirmation mail renders: the stay's {@code code} (a bearer credential,
 * invariant #7; never a stretch's row code), the guest contact, each stop in day order and the summed
 * total in minor units + ISO currency (#5). {@code everConfirmed} holds iff every stretch was confirmed.
 * The window is re-derived from the first stretch's current cutoff, as {@link BookingConfirmationFacts}'.
 */
public record StayConfirmationFacts(StayId stayId, String code, CustomerId customerId, List<Stop> stops,
		long amountMinor, String currency, boolean everConfirmed, CancellationWindow cancellationWindowAtBirth,
		int lateCancelRefundBps) {

	public StayConfirmationFacts {
		stops = List.copyOf(stops);
	}

	/** One stretch: its booking, its set and its inclusive {@code Europe/Tirane} days (invariant #6). */
	public record Stop(BookingId bookingId, SetId setId, LocalDate firstDate, LocalDate lastDate) {
	}

	/** The stay's first service day. */
	public LocalDate firstDate() {
		return stops.getFirst().firstDate();
	}

	/** The stay's last service day. */
	public LocalDate lastDate() {
		return stops.getLast().lastDate();
	}
}
