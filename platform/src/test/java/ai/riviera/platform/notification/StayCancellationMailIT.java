package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.remodel.NewReceipt;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcome;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcomeKind;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.StayCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * A stitched stay's cancellation mail end-to-end: a guest cancel by the stay's code publishes one
 * {@code BookingCancelled} per stretch and one {@code StayCancelled}, and the registry delivers exactly one
 * {@code BOOKING_CANCELLATION} under the stay's code, span and summed refund; a stay a remodel released whole
 * (#1292) mails once with no refund and a rebook link; a stretch a remodel ends on its own still mails that
 * stretch, with its rebook link. Stays are SQL-seeded on the first seeded venue, never claimed, on dates no other
 * IT uses. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class StayCancellationMailIT {

	private static final Duration WAIT = Duration.ofSeconds(15);
	private static final long STRETCH_AMOUNT = 9300L;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MockMailer mailer;

	@Autowired
	CancelBooking cancelBooking;

	@Autowired
	RemodelReceipts receipts;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	private BookingMailFixtures fixtures;

	private record SetRef(long setId, long venueId, String venueName) {
	}

	private record SeededStay(String code, List<Long> stretches, LocalDate first) {
	}

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
	}

	@Test
	void mailsTheStayOnceWhenTheGuestCancelsIt() {
		String email = "stay-cancel@example.com";
		List<SetRef> sets = twoSetsOfOneVenue();
		SeededStay stay = seedStay(sets, LocalDate.of(2036, 4, 1), email, "AWAITING_PAYMENT");
		stay.stretches().forEach(stretch -> fixtures.publishInTransaction(
				new PaymentConfirmed(new BookingRef(stretch), "pi_stay_cancel_" + stretch)));
		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.STAY_CONFIRMATION) == 1L);

		CancelOutcome.Cancelled cancelled = assertInstanceOf(CancelOutcome.Cancelled.class,
				cancelBooking.cancel(stay.code()));

		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.BOOKING_CANCELLATION) == 1L);
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> count(email, SentEmail.Kind.BOOKING_CANCELLATION) == 1L);
		assertEquals(2 * STRETCH_AMOUNT, cancelled.refundMinor(), "ten years out is the free window");
		assertEquals(new BookingCancellationMail(stay.code(), sets.get(0).venueName(), stay.first(),
						stay.first().plusDays(3), 2 * STRETCH_AMOUNT, "EUR", RefundReason.POLICY, null),
				mailer.lastTo(email).orElseThrow().cancellation(),
				"the stay's code, never a stretch's row code, with the span and the summed refund");
	}

	/**
	 * Mirrors {@code CancelStayIT.aGuestCancelSkipsTheStretchARemodelEndedAndCancelsTheRest}: a remodel refunded stretch
	 * 1 and moved stretch 2, so the guest's cancel is stretch 2's free exit, a {@code VENUE_CHANGE} with no rebook link.
	 */
	@Test
	void aGuestCancelAfterARemodelEndedAStretchMailsOnlyTheLiveRemainder() {
		String email = "stay-cancel-remainder@example.com";
		List<SetRef> sets = twoSetsOfOneVenue();
		SeededStay stay = seedStay(sets, LocalDate.of(2036, 5, 1), email, "AWAITING_PAYMENT");
		stay.stretches().forEach(stretch -> fixtures.publishInTransaction(
				new PaymentConfirmed(new BookingRef(stretch), "pi_stay_remainder_" + stretch)));
		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.STAY_CONFIRMATION) == 1L);
		long ended = stay.stretches().get(0);
		long live = stay.stretches().get(1);
		LocalDate liveFirst = stay.first().plusDays(2);
		jdbc.sql("UPDATE booking SET status = 'CANCELLED', cancelled_at = now() WHERE id = :id").param("id", ended).update();
		endedByRemodel(sets.get(0), ended, stay.first(), ReceiptOutcomeKind.REFUND);
		jdbc.sql("UPDATE booking SET moved_at = now() WHERE id = :id").param("id", live).update();

		CancelOutcome.Cancelled cancelled = assertInstanceOf(CancelOutcome.Cancelled.class,
				cancelBooking.cancel(stay.code()));

		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.BOOKING_CANCELLATION) == 1L);
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> count(email, SentEmail.Kind.BOOKING_CANCELLATION) == 1L);
		assertEquals(STRETCH_AMOUNT, cancelled.refundMinor(), "the free exit refunds the live stretch in full");
		assertEquals(new BookingCancellationMail(stay.code(), sets.get(1).venueName(), liveFirst, liveFirst.plusDays(1),
						STRETCH_AMOUNT, "EUR", RefundReason.VENUE_CHANGE, null),
				mailer.lastTo(email).orElseThrow().cancellation(),
				"the remainder's span and first stop, never the ended stretch's, and no rebook link for a free exit");
	}

	@Test
	void mailsAStayARemodelReleasedOnceWithItsRebookLink() {
		String email = "stay-released@example.com";
		List<SetRef> sets = twoSetsOfOneVenue();
		SeededStay stay = seedStay(sets, LocalDate.of(2036, 4, 21), email, "CANCELLED");
		endedByRemodel(sets.get(0), stay.stretches().get(0), stay.first(), ReceiptOutcomeKind.RELEASE);
		endedByRemodel(sets.get(1), stay.stretches().get(1), stay.first().plusDays(2), ReceiptOutcomeKind.RELEASE);
		StayId stayId = new StayId(jdbc.sql("SELECT id FROM stay WHERE code = :code").param("code", stay.code())
				.query(Long.class).single());

		fixtures.publishInTransaction(new StayCancelled(stayId, 0, "EUR", RefundReason.VENUE_CHANGE));

		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.BOOKING_CANCELLATION) == 1L);
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> count(email, SentEmail.Kind.BOOKING_CANCELLATION) == 1L);
		BookingCancellationMail mail = mailer.lastTo(email).orElseThrow().cancellation();
		assertEquals(stay.code(), mail.bookingCode(), "the stay's code, never a stretch's");
		assertEquals(stay.first(), mail.bookingDate());
		assertEquals(stay.first().plusDays(3), mail.lastDate(), "the whole span");
		assertEquals(0L, mail.refundMinor(), "nothing was collected, so nothing is returned");
		assertEquals(RefundReason.VENUE_CHANGE, mail.reason());
		assertNotNull(mail.rebookLink(), "the released stay keeps its way back, as a released lone booking does");
	}

	@Test
	void aStretchEndedAloneByARemodelStillMailsWithItsRebookLink() {
		String email = "stay-remodel@example.com";
		List<SetRef> sets = twoSetsOfOneVenue();
		SeededStay stay = seedStay(sets, LocalDate.of(2036, 4, 11), email, "CANCELLED");
		long ended = stay.stretches().get(1);
		LocalDate endedFirst = stay.first().plusDays(2);
		endedByRemodel(sets.get(1), ended, endedFirst, ReceiptOutcomeKind.REFUND);

		fixtures.publishInTransaction(new BookingCancelled(new BookingId(ended), new VenueId(sets.get(1).venueId()),
				new SetId(sets.get(1).setId()), endedFirst, STRETCH_AMOUNT, "EUR", RefundReason.VENUE_CHANGE,
				endedFirst.plusDays(1)));

		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.BOOKING_CANCELLATION) == 1L);
		BookingCancellationMail mail = mailer.lastTo(email).orElseThrow().cancellation();
		assertEquals(stay.code(), mail.bookingCode());
		assertEquals(endedFirst, mail.bookingDate(), "only the stretch's own days");
		assertEquals(endedFirst.plusDays(1), mail.lastDate());
		assertNotNull(mail.rebookLink(), "the remodel-ended stretch keeps its way back");
	}

	private List<SetRef> twoSetsOfOneVenue() {
		return jdbc.sql("""
				SELECT sp.id, sp.venue_id, v.name
				FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE sp.pool = 'ONLINE'
				  AND sp.venue_id = (SELECT venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1)
				ORDER BY sp.id LIMIT 2
				""")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"), rs.getString("name")))
				.list();
	}

	/** A stay of two two-day stretches on {@code sets}, both in {@code status}. */
	private SeededStay seedStay(List<SetRef> sets, LocalDate first, String email, String status) {
		String code = "STAYC" + System.nanoTime();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Stay Guest', '+355699') "
				+ "RETURNING id").param("e", email).query(Long.class).single();
		long stay = jdbc.sql("""
				INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:code, :v, :first, :last) RETURNING id
				""").param("code", code).param("v", sets.get(0).venueId()).param("first", first)
				.param("last", first.plusDays(3)).query(Long.class).single();
		List<Long> stretches = List.of(
				seedStretch(sets.get(0), code + "-1", customer, stay, first, status),
				seedStretch(sets.get(1), code + "-2", customer, stay, first.plusDays(2), status));
		return new SeededStay(code, stretches, first);
	}

	private long seedStretch(SetRef set, String rowCode, long customer, long stay, LocalDate first, String status) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, stay_id)
				VALUES (:code, :v, :set, :c, :first, :last, :amount, 'EUR', :status, :stay)
				RETURNING id
				""").param("code", rowCode).param("v", set.venueId()).param("set", set.setId()).param("c", customer)
				.param("first", first).param("last", first.plusDays(1)).param("amount", STRETCH_AMOUNT)
				.param("status", status).param("stay", stay).query(Long.class).single();
	}

	/** The receipt line a commit writes for a claim it refunded or released — what {@code endedByRemodel} reads. */
	private void endedByRemodel(SetRef set, long bookingId, LocalDate date, ReceiptOutcomeKind kind) {
		long operator = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "stay-remodel-" + System.nanoTime()).query(Long.class).single();
		boolean refund = kind == ReceiptOutcomeKind.REFUND;
		receipts.store(new NewReceipt(new VenueId(set.venueId()), new OperatorId(operator), Instant.now(), List.of(),
				List.of(new ReceiptOutcome(new BookingId(bookingId), date, new SpotRef(new SetId(set.setId()), "A", 1),
						kind, STRETCH_AMOUNT, "EUR", refund ? 500L : 0L)),
				refund ? "Re-laying row A" : "", List.of()));
	}

	private long count(String email, SentEmail.Kind kind) {
		return mailer.sent().stream().filter(e -> e.kind() == kind).filter(e -> e.toEmail().equals(email)).count();
	}
}
