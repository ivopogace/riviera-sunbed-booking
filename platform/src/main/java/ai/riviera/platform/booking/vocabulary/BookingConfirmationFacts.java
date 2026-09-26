package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * What an <strong>admin resend</strong> rebuilds a confirmation mail from; the automatic listener
 * keeps reading its {@code BookingConfirmed} payload. Days {@code bookingDate} to {@code lastDate}
 * inclusive (invariant #6); money in minor units + ISO currency (invariant #5); {@code code} is a bearer
 * credential, never logged or put in an event (invariant #7). {@code everConfirmed} (from
 * {@code confirmed_at}: cancelled-after-confirm qualifies) gates the resend. A null window shows no
 * disclosure (drift: RESPONSIBILITIES.md §booking); {@code lateCancelRefundBps} is 0 outside LATE.
 */
public record BookingConfirmationFacts(SetId setId, LocalDate bookingDate, LocalDate lastDate,
		long amountMinor, String currency, String code, CustomerId customerId, boolean everConfirmed,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {

	/** A one-day booking: its last day is its first. */
	public BookingConfirmationFacts(SetId setId, LocalDate bookingDate, long amountMinor, String currency,
			String code, CustomerId customerId, boolean everConfirmed,
			CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {
		this(setId, bookingDate, bookingDate, amountMinor, currency, code, customerId, everConfirmed,
				cancellationWindowAtBirth, lateCancelRefundBps);
	}
}
