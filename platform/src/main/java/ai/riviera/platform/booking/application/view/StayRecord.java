package ai.riviera.platform.booking.application.view;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.StayStatus;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/** A stay as stored: the group's code (invariant #7), venue and span, and its stretches' bookings in day order. */
public record StayRecord(StayId id, String code, VenueId venueId, LocalDate firstDay, LocalDate lastDay,
		List<BookingRecord> stretches) {

	public StayRecord {
		stretches = List.copyOf(stretches);
	}

	/**
	 * The stay read as one booking: its code and span, {@link StayStatus} over the stretches, the first
	 * stretch's spot and birth, money and refunds summed, the latest cancellation or move.
	 */
	public BookingRecord asBooking() {
		BookingRecord first = stretches.getFirst();
		BookingStatus status = StayStatus.of(stretches.stream().map(BookingRecord::status).toList());
		long amount = stretches.stream().mapToLong(BookingRecord::amountMinor).reduce(0L, Math::addExact);
		List<Long> refunds = stretches.stream().map(BookingRecord::refundMinor).filter(Objects::nonNull).toList();
		Long refund = refunds.isEmpty() ? null : refunds.stream().mapToLong(Long::longValue).reduce(0L, Math::addExact);
		return new BookingRecord(first.id(), code, status, venueId, first.setId(), first.customerId(), firstDay, lastDay,
				amount, first.currency(), latest(BookingRecord::cancelledAt), refund, null, latestCancelReason(),
				first.createdAt(), first.acceptedAt(), latest(BookingRecord::movedAt));
	}

	private RefundReason latestCancelReason() {
		return stretches.stream().filter(s -> s.cancelledAt() != null)
				.max(Comparator.comparing(BookingRecord::cancelledAt)).map(BookingRecord::cancelReason).orElse(null);
	}

	private Instant latest(Function<BookingRecord, Instant> at) {
		return stretches.stream().map(at).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
	}
}
