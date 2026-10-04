package ai.riviera.platform.notification.application;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.vocabulary.StayMoveFacts;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Resolves a booking mail's facts through three owners' ports: {@code booking} (code, customer
 * id), {@code venue} (venue name, set label), {@code customer} (address); in {@code application},
 * not beside the listeners (ADR-0007), never a published port. The reads short-circuit in this
 * order: the outcome names the <em>first</em> missing fact, which the caller's counter tags. No
 * transaction: callers are after-commit listeners, and one would pin a connection across their SMTP
 * send. Rationale: {@code RESPONSIBILITIES.md} §notification.
 */
@Service
public class BookingMailFactsService {

	private final BookingNotificationFacts bookings;
	private final SetBookingFacts sets;
	private final CustomerLookup customers;
	private final RebookLinks rebookLinks;

	BookingMailFactsService(BookingNotificationFacts bookings, SetBookingFacts sets,
			CustomerLookup customers, RebookLinks rebookLinks) {
		this.bookings = bookings;
		this.sets = sets;
		this.customers = customers;
		this.rebookLinks = rebookLinks;
	}

	/**
	 * The facts for this booking on this set, or the first one that did not resolve. Never throws for
	 * a missing row: absence is an expected outcome the caller must account for, not an exceptional
	 * condition (riviera-java-conventions §6).
	 */
	public BookingMailFacts resolve(BookingId bookingId, SetId setId) {
		Optional<BookingNotificationInfo> booking = bookings.notificationInfo(bookingId);
		if (booking.isEmpty()) {
			return new BookingMailFacts.Missing(MissingBookingFact.NO_BOOKING);
		}
		Optional<SetBookingInfo> set = sets.setBookingInfo(setId);
		if (set.isEmpty()) {
			return new BookingMailFacts.Missing(MissingBookingFact.NO_SET);
		}
		Optional<GuestContact> contact = customers.findById(booking.get().customerId());
		if (contact.isEmpty()) {
			return new BookingMailFacts.Missing(MissingBookingFact.NO_CONTACT);
		}
		return new BookingMailFacts.Resolved(contact.get().email(), booking.get().code(),
				set.get().venueName(), set.get().rowLabel(), set.get().positionNo());
	}

	/**
	 * The stay's one confirmation mail with the birth terms the caller holds, or the first fact that did
	 * not resolve: every stop's set, then the contact. Never throws for a missing row, as {@link #resolve}.
	 */
	public StayMailFacts resolveStay(StayConfirmationFacts stay, CancellationWindow windowAtBirth,
			int lateCancelRefundBps) {
		List<StayConfirmationMail.Stop> stops = new ArrayList<>();
		String venueName = null;
		for (StayConfirmationFacts.Stop stop : stay.stops()) {
			Optional<SetBookingInfo> set = sets.setBookingInfo(stop.setId());
			if (set.isEmpty()) {
				return new StayMailFacts.Missing(MissingBookingFact.NO_SET);
			}
			venueName = set.get().venueName();
			stops.add(new StayConfirmationMail.Stop(stop.firstDate(), stop.lastDate(), set.get().rowLabel(),
					set.get().positionNo()));
		}
		Optional<GuestContact> contact = customers.findById(stay.customerId());
		if (contact.isEmpty()) {
			return new StayMailFacts.Missing(MissingBookingFact.NO_CONTACT);
		}
		return new StayMailFacts.Resolved(contact.get().email(), new StayConfirmationMail(stay.code(), venueName,
				stay.firstDate(), stay.lastDate(), stops, stay.amountMinor(),
				stay.currency(), windowAtBirth, lateCancelRefundBps));
	}

	/**
	 * The move's one reminder: both spots' labels off the live map and the contact, or the first fact that did
	 * not resolve. The distance is {@code booking}'s reading, taken with the same map.
	 */
	public MoveReminderMailFacts resolveMoveReminder(StayMoveFacts move, URI bookingLink) {
		Map<SetId, SetBookingInfo> spots = sets.setBookingInfos(List.of(move.fromSetId(), move.toSetId()));
		SetBookingInfo from = spots.get(move.fromSetId());
		SetBookingInfo to = spots.get(move.toSetId());
		if (from == null || to == null) {
			return new MoveReminderMailFacts.Missing(MissingBookingFact.NO_SET);
		}
		Optional<GuestContact> contact = customers.findById(move.customerId());
		if (contact.isEmpty()) {
			return new MoveReminderMailFacts.Missing(MissingBookingFact.NO_CONTACT);
		}
		return new MoveReminderMailFacts.Resolved(contact.get().email(), new MoveReminderMail(move.code(),
				to.venueName(), move.moveDate(), move.stayLastDate(), from.rowLabel(), from.positionNo(),
				to.rowLabel(), to.positionNo(), move.rowsAway(), move.positionsAway(), bookingLink, move.fromDayHeld()));
	}

	/**
	 * A stay request's one decline, expiry or payment-due mail under the stay's code and span, or the first
	 * fact that did not resolve: the stay, the venue (off the first stop's set), then the contact.
	 */
	public StayRequestMailFacts resolveStayRequest(StayId stayId) {
		Optional<StayConfirmationFacts> stay = bookings.stayConfirmationFacts(stayId);
		if (stay.isEmpty()) {
			return new StayRequestMailFacts.Missing(MissingBookingFact.NO_BOOKING);
		}
		Optional<SetBookingInfo> set = sets.setBookingInfo(stay.get().stops().getFirst().setId());
		if (set.isEmpty()) {
			return new StayRequestMailFacts.Missing(MissingBookingFact.NO_SET);
		}
		Optional<GuestContact> contact = customers.findById(stay.get().customerId());
		if (contact.isEmpty()) {
			return new StayRequestMailFacts.Missing(MissingBookingFact.NO_CONTACT);
		}
		return new StayRequestMailFacts.Resolved(contact.get().email(), stay.get().code(), set.get().venueName(),
				stay.get().firstDate(), stay.get().lastDate());
	}

	/**
	 * The stay's one cancellation mail under the stay's code and the span of the stops handed in, with the caller's summed
	 * refund and, when the caller says a remodel ended them, {@link RebookLinks}' link for their first day; or the first
	 * fact that did not resolve: the venue (off the first stop's set), then the contact.
	 */
	public StayCancellationMailFacts resolveStayCancellation(StayConfirmationFacts stay, long refundMinor,
			String currency, RefundReason reason, boolean endedByRemodel) {
		Optional<SetBookingInfo> set = sets.setBookingInfo(stay.stops().getFirst().setId());
		if (set.isEmpty()) {
			return new StayCancellationMailFacts.Missing(MissingBookingFact.NO_SET);
		}
		Optional<GuestContact> contact = customers.findById(stay.customerId());
		if (contact.isEmpty()) {
			return new StayCancellationMailFacts.Missing(MissingBookingFact.NO_CONTACT);
		}
		URI rebookLink = endedByRemodel ? rebookLinks.forDate(set.get().venueId(), stay.firstDate()) : null;
		return new StayCancellationMailFacts.Resolved(contact.get().email(), new BookingCancellationMail(stay.code(),
				set.get().venueName(), stay.firstDate(), stay.lastDate(), refundMinor, currency, reason, rebookLink));
	}
}
