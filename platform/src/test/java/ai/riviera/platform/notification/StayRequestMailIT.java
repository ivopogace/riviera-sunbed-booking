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
import ai.riviera.platform.booking.events.StayPaymentDue;
import ai.riviera.platform.booking.events.StayRequestDeclined;
import ai.riviera.platform.booking.events.StayRequestExpired;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * A stay request's decline, expiry and payment-due each mail the guest once, under the stay's code and
 * whole span, never a stretch's row code (#1267, invariant #7). The request mails name no spot and the
 * payment-due mail carries the stay's total (RESPONSIBILITIES.md §notification). Stays are SQL-seeded on
 * the first seeded venue, never claimed, on 2037 dates no other IT uses. Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class StayRequestMailIT {

	private static final Duration WAIT = Duration.ofSeconds(15);
	private static final long STRETCH_AMOUNT = 9400L;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MockMailer mailer;

	@Autowired
	BookingLinks links;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	private BookingMailFixtures fixtures;

	private record SetRef(long setId, long venueId, String venueName) {
	}

	private record SeededStay(long id, String code, LocalDate first) {
	}

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
	}

	@Test
	void aDeclinedStayMailsOnceUnderTheStaysCodeAndSpan() {
		String email = "stay-request-declined@example.com";
		List<SetRef> sets = twoSetsOfOneVenue();
		SeededStay stay = seedStay(sets, LocalDate.of(2037, 5, 1), email, "DECLINED");

		fixtures.publishInTransaction(new StayRequestDeclined(new StayId(stay.id()), DeclineReason.ANOTHER_GUEST));

		awaitExactlyOne(email, SentEmail.Kind.REQUEST_DECLINED);
		assertEquals(new RequestDeclinedMail(stay.code(), sets.get(0).venueName(), stay.first(), stay.first().plusDays(3),
				links.forBooking(stay.code()), DeclineReason.ANOTHER_GUEST), mailer.lastTo(email).orElseThrow().requestDeclined());
	}

	@Test
	void anExpiredStayMailsOnceUnderTheStaysCodeAndSpan() {
		String email = "stay-request-expired@example.com";
		List<SetRef> sets = twoSetsOfOneVenue();
		SeededStay stay = seedStay(sets, LocalDate.of(2037, 5, 11), email, "EXPIRED");

		fixtures.publishInTransaction(new StayRequestExpired(new StayId(stay.id())));

		awaitExactlyOne(email, SentEmail.Kind.REQUEST_EXPIRED);
		assertEquals(new RequestExpiredMail(stay.code(), sets.get(0).venueName(), stay.first(), stay.first().plusDays(3),
				links.forBooking(stay.code())), mailer.lastTo(email).orElseThrow().requestExpired());
	}

	@Test
	void anAcceptedStayMailsItsTotalAndDeadlineOnce() {
		String email = "stay-request-due@example.com";
		List<SetRef> sets = twoSetsOfOneVenue();
		SeededStay stay = seedStay(sets, LocalDate.of(2037, 5, 21), email, "AWAITING_PAYMENT");
		Instant payBy = Instant.parse("2037-05-20T18:00:00Z");

		fixtures.publishInTransaction(new StayPaymentDue(new StayId(stay.id()), payBy, 2 * STRETCH_AMOUNT, "EUR", null, 0));

		awaitExactlyOne(email, SentEmail.Kind.PAYMENT_DUE);
		assertEquals(new PaymentDueMail(stay.code(), sets.get(0).venueName(), stay.first(), stay.first().plusDays(3), payBy,
				2 * STRETCH_AMOUNT, "EUR", links.forBooking(stay.code()), null, 0),
				mailer.lastTo(email).orElseThrow().paymentDue());
	}

	private void awaitExactlyOne(String email, SentEmail.Kind kind) {
		Awaitility.await().atMost(WAIT).until(() -> count(email, kind) == 1L);
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT).until(() -> count(email, kind) == 1L);
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
		String code = "STAYR" + System.nanoTime();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Stay Guest', '+355699') "
				+ "RETURNING id").param("e", email).query(Long.class).single();
		long stay = jdbc.sql("""
				INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:code, :v, :first, :last) RETURNING id
				""").param("code", code).param("v", sets.get(0).venueId()).param("first", first)
				.param("last", first.plusDays(3)).query(Long.class).single();
		seedStretch(sets.get(0), code + "-1", customer, stay, first, status);
		seedStretch(sets.get(1), code + "-2", customer, stay, first.plusDays(2), status);
		return new SeededStay(stay, code, first);
	}

	private void seedStretch(SetRef set, String rowCode, long customer, long stay, LocalDate first, String status) {
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, stay_id)
				VALUES (:code, :v, :set, :c, :first, :last, :amount, 'EUR', :status, :stay)
				""").param("code", rowCode).param("v", set.venueId()).param("set", set.setId()).param("c", customer)
				.param("first", first).param("last", first.plusDays(1)).param("amount", STRETCH_AMOUNT)
				.param("status", status).param("stay", stay).update();
	}

	private long count(String email, SentEmail.Kind kind) {
		return mailer.sent().stream().filter(e -> e.kind() == kind).filter(e -> e.toEmail().equals(email)).count();
	}
}
