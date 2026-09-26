package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.domain.RefundPolicy;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.api.VenueRates;

/**
 * The one place the server-side cancellation refund is computed (invariant #10), shared by the
 * view's quote and the cancel so the rule cannot drift: the set's cutoff from {@code venue::api},
 * the evening-before boundary ({@link BookingCutoff}) and the late share via {@link RefundPolicy}.
 * A remodel-moved booking gets the <strong>free-exit override</strong>: a full refund until
 * {@link BookingCutoff#freeExitEndsAt}, whatever LATE answers, never reopening CLOSED (ADR-0005).
 * {@code public} for the {@code view} slice, not exported. Rationale: RESPONSIBILITIES.md §booking.
 */
@Component
public class CancellationPolicy implements QuoteCancellationTerms {

	private final SetBookingFacts setFacts;
	private final VenueRates rates;
	private final BookingCutoff cutoff;
	private final Clock clock;

	CancellationPolicy(SetBookingFacts setFacts, VenueRates rates, BookingCutoff cutoff, Clock clock) {
		this.setFacts = setFacts;
		this.rates = rates;
		this.cutoff = cutoff;
		this.clock = clock;
	}

	/**
	 * The refund quote: set facts, window, server-computed refund (minor units) and reason. An open
	 * free exit (moved booking, not CLOSED) refunds in full as {@code VENUE_CHANGE}, FREE and LATE
	 * alike. Throws {@link IllegalStateException} on an unknown set (an FK breach, not a flow).
	 */
	public RefundQuote quote(BookingRecord booking) {
		SetBookingInfo set = setFacts.setBookingInfo(booking.setId()).orElseThrow(() ->
				new IllegalStateException("no set info for set " + booking.setId().value()));
		Instant now = clock.instant();
		CancellationWindow window = cutoff.cancellationWindow(set.bookingCutoff(), booking.bookingDate(), now);
		Instant freeExitUntil = freeExitUntil(booking, window, now);
		if (freeExitUntil != null) {
			return new RefundQuote(set, window, booking.amountMinor(), RefundReason.VENUE_CHANGE, freeExitUntil);
		}
		int lateBps = window == CancellationWindow.LATE
				? rates.lateCancelRefundBps(booking.venueId()).orElse(0)
				: 0;
		long refundMinor = RefundPolicy.refundMinor(booking.amountMinor(), window, lateBps);
		return new RefundQuote(set, window, refundMinor, RefundReason.POLICY, freeExitUntil);
	}

	/** The open free-exit deadline of a moved booking, or {@code null}: never moved, past it, or CLOSED. */
	private Instant freeExitUntil(BookingRecord booking, CancellationWindow window, Instant now) {
		if (booking.movedAt() == null || window == CancellationWindow.CLOSED) {
			return null;
		}
		Instant deadline = cutoff.freeExitEndsAt(booking.bookingDate(), booking.movedAt());
		return now.isBefore(deadline) ? deadline : null;
	}

	/**
	 * The pre-reserve terms for this set and date, quoted now (invariant #10): the window a booking
	 * made now would be born in, the free-cancellation deadline and the late share. Empty for an
	 * unknown set: a stale map is an expected flow here, unlike {@link #quote}'s FK breach.
	 */
	@Override
	public Optional<CancellationTerms> terms(SetId setId, LocalDate bookingDate) {
		return setFacts.setBookingInfo(setId).map(set -> {
			CancellationWindow window = cutoff.cancellationWindow(set.bookingCutoff(), bookingDate);
			return new CancellationTerms(window,
					cutoff.freeCancellationEndsAt(set.bookingCutoff(), bookingDate),
					lateShare(window, set.venueId()));
		});
	}

	/**
	 * The window a booking was born in and the late share its disclosure promises — the same
	 * classification as {@link #terms}, read at the booking's {@code createdAt} instead of now. What
	 * the event publication sites stamp; empty for an unknown set so a confirm never fails on it.
	 */
	public Optional<BirthTerms> windowAtBirth(SetId setId, LocalDate bookingDate, Instant createdAt) {
		return setFacts.setBookingInfo(setId).map(set -> {
			CancellationWindow window =
					cutoff.cancellationWindow(set.bookingCutoff(), bookingDate, createdAt);
			return new BirthTerms(window, lateShare(window, set.venueId()));
		});
	}

	/** The at-birth classification the events and mails disclose. */
	public record BirthTerms(CancellationWindow window, int lateCancelRefundBps) {
	}

	/** The venue's late share applies only inside the LATE window; every other phase discloses 0. */
	private int lateShare(CancellationWindow window, VenueId venueId) {
		return window == CancellationWindow.LATE ? rates.lateCancelRefundBps(venueId).orElse(0) : 0;
	}

	/**
	 * The computed cancellation terms: set display, which {@link CancellationWindow} the request
	 * falls in, the refund due, the {@link RefundReason} a cancellation now would carry, and — for a
	 * moved booking whose free exit is still open — its deadline ({@code null} otherwise).
	 * {@code beforeCutoff} is derived rather than stored so the window stays the single carrier of
	 * the temporal decision.
	 */
	public record RefundQuote(SetBookingInfo set, CancellationWindow window, long refundMinor,
			RefundReason reason, Instant freeExitUntil) {

		/** Whether free cancellation is still open — what the booking view reports on the wire. */
		public boolean beforeCutoff() {
			return window == CancellationWindow.FREE;
		}

		/** Whether a cancellation may still be actioned at all (invariant #10). */
		public boolean cancellationOpen() {
			return window != CancellationWindow.CLOSED;
		}

	}
}
