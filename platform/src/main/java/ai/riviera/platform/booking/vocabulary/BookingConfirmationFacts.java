package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Everything needed to rebuild one booking's confirmation mail from scratch (#380) — the read an
 * <strong>admin resend</strong> makes, where the automatic listener has a {@code BookingConfirmed}
 * payload to work from and this trigger has nothing.
 *
 * <p>Wider than {@link BookingNotificationInfo} on purpose, and not a replacement for it: the
 * listener deliberately takes {@code bookingDate}, {@code amountMinor} and {@code currency} off the
 * event, because those are immutable facts <em>of the confirmation</em> and re-reading them would let
 * a later edit rewrite the mail for a past event. A resend has no event, so it re-reads them here.
 *
 * <p>{@code code} is the arrival credential (invariant #7). It is read at send time and never
 * persisted into an event payload, exactly as {@link BookingNotificationInfo} established — the Event
 * Publication Registry stores payloads as text and retains them under {@code archive} completion.
 *
 * <p>{@code everConfirmed} is the guard, not decoration: a booking that never reached
 * {@code CONFIRMED} was never owed a confirmation, so mailing one would tell the tourist something
 * untrue. It reads from {@code confirmed_at} rather than from the current status, because a booking
 * cancelled after confirmation <em>did</em> get a confirmation — a status test would call that one
 * never-confirmed and refuse a legitimate resend.
 *
 * @param setId the set, from which {@code venue} supplies the venue name and spot label
 * @param bookingDate the booked day, a {@code LocalDate} in {@code Europe/Tirane} (invariant #6)
 * @param amountMinor the gross amount in integer minor units (invariant #5)
 * @param currency the ISO 4217 code that amount is in
 * @param code the arrival code the mail carries (invariant #7 — never logged, never in an event)
 * @param customerId the guest-contact link an address is resolved from via {@code customer::api}
 * @param everConfirmed whether this booking ever reached {@code CONFIRMED}
 * @param cancellationWindowAtBirth the window in force at the booking's creation (#795), re-derived
 *        from the venue's current cutoff — bounded, documented drift after a cutoff edit; null when
 *        it cannot be classified (unknown set), which renders no disclosure
 * @param lateCancelRefundBps the venue's late share the disclosure promises; 0 outside LATE
 */
public record BookingConfirmationFacts(SetId setId, LocalDate bookingDate, long amountMinor,
		String currency, String code, CustomerId customerId, boolean everConfirmed,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {
}
