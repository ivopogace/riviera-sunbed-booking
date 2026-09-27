package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.RepetitionInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.StayConfirmationMail;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The stitched stay's confirmation mail end-to-end: each stretch's verified {@code PaymentConfirmed},
 * in its own transaction and racing the other, drives {@code booking}'s confirm; the confirm that
 * completes the stay publishes {@code StayConfirmed}, and the registry delivers exactly one
 * {@code STAY_CONFIRMATION} naming every stop, the stay's code and total, while each stretch's
 * {@code BookingConfirmed} mails nothing; an admin resend on any stretch resends the stay's mail. Stays are SQL-seeded on the first seeded venue, never claimed,
 * on dates no other IT uses. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class StayConfirmationMailIT {

	private static final Duration WAIT = Duration.ofSeconds(15);
	private static final long STRETCH_AMOUNT = 9100L;

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MockMailer mailer;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	IncompleteEventPublications incompletePublications;

	private record SetRef(long setId, long venueId, String venueName, String rowLabel, int positionNo) {
	}

	private record SeededStay(String code, List<Long> stretches, LocalDate first) {
	}

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
	}

	@RepeatedTest(3)
	void mailsTheStayOnceAfterEveryStretchConfirms(RepetitionInfo info) throws Exception {
		String email = "stay-" + info.getCurrentRepetition() + "@example.com";
		List<SetRef> sets = twoSetsOfOneVenue();
		SeededStay stay = seedAwaitingStay(sets, LocalDate.of(2031, 5, 1).plusDays(10L * info.getCurrentRepetition()),
				email);

		confirmConcurrently(stay.stretches());

		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.STAY_CONFIRMATION) == 1L);
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> count(email, SentEmail.Kind.STAY_CONFIRMATION) == 1L);
		assertEquals(0L, count(email, SentEmail.Kind.BOOKING_CONFIRMATION), "no stretch is mailed on its own");
		LocalDate first = stay.first();
		assertEquals(new StayConfirmationMail(stay.code(), sets.get(0).venueName(), first, first.plusDays(3),
				List.of(new StayConfirmationMail.Stop(first, first.plusDays(1), sets.get(0).rowLabel(),
								sets.get(0).positionNo()),
						new StayConfirmationMail.Stop(first.plusDays(2), first.plusDays(3), sets.get(1).rowLabel(),
								sets.get(1).positionNo())),
				2 * STRETCH_AMOUNT, "EUR", CancellationWindow.FREE, 0),
				mailer.lastTo(email).orElseThrow().stayConfirmation());
		Awaitility.await().atMost(WAIT).until(() -> automaticSentAttempts(stay.stretches()) == 2L);
	}

	@Test
	void doesNotResendWhenACompletedPublicationIsResubmitted() throws Exception {
		String email = "stay-replay@example.com";
		SeededStay stay = seedAwaitingStay(twoSetsOfOneVenue(), LocalDate.of(2031, 7, 1), email);
		confirmConcurrently(stay.stretches());
		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.STAY_CONFIRMATION) == 1L);

		incompletePublications.resubmitIncompletePublications(publication -> true);

		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> count(email, SentEmail.Kind.STAY_CONFIRMATION) == 1L);
	}

	@Test
	void adminResendOnAStretchResendsTheStayMail() throws Exception {
		String email = "stay-resend@example.com";
		SeededStay stay = seedAwaitingStay(twoSetsOfOneVenue(), LocalDate.of(2031, 7, 11), email);
		confirmConcurrently(stay.stretches());
		Awaitility.await().atMost(WAIT).until(() -> count(email, SentEmail.Kind.STAY_CONFIRMATION) == 1L);
		Awaitility.await().atMost(WAIT).until(() -> automaticSentAttempts(stay.stretches()) == 2L);

		mvc.perform(post("/api/admin/mail-deliveries/{id}/resend", stay.stretches().get(1))
						.with(user("operator").roles("ADMIN")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("SENT"));

		assertEquals(2L, count(email, SentEmail.Kind.STAY_CONFIRMATION));
		assertEquals(0L, count(email, SentEmail.Kind.BOOKING_CONFIRMATION));
		assertEquals(stay.code(), mailer.lastTo(email).orElseThrow().stayConfirmation().bookingCode());
		assertEquals(2L, jdbc.sql("""
				SELECT count(*) FROM booking_confirmation_mail_attempt
				WHERE booking_id IN (:ids) AND trigger_source = 'ADMIN_RESEND' AND outcome = 'SENT'
				""").param("ids", stay.stretches()).query(Long.class).single(), "the resend is logged on every stretch");
	}

	private List<SetRef> twoSetsOfOneVenue() {
		return jdbc.sql("""
				SELECT sp.id, sp.venue_id, v.name, sp.row_label, sp.position_no
				FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE sp.pool = 'ONLINE'
				  AND sp.venue_id = (SELECT venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1)
				ORDER BY sp.id LIMIT 2
				""")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"), rs.getString("name"),
						rs.getString("row_label"), rs.getInt("position_no")))
				.list();
	}

	/** A stay of two two-day stretches on {@code sets}, both {@code AWAITING_PAYMENT}. */
	private SeededStay seedAwaitingStay(List<SetRef> sets, LocalDate first, String email) {
		String code = "STAYM" + System.nanoTime();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Stay Guest', '+355699') "
				+ "RETURNING id").param("e", email).query(Long.class).single();
		long stay = jdbc.sql("""
				INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:code, :v, :first, :last) RETURNING id
				""").param("code", code).param("v", sets.get(0).venueId()).param("first", first)
				.param("last", first.plusDays(3)).query(Long.class).single();
		List<Long> stretches = List.of(
				seedStretch(sets.get(0), code + "-1", customer, stay, first),
				seedStretch(sets.get(1), code + "-2", customer, stay, first.plusDays(2)));
		return new SeededStay(code, stretches, first);
	}

	private long seedStretch(SetRef set, String rowCode, long customer, long stay, LocalDate first) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, stay_id)
				VALUES (:code, :v, :set, :c, :first, :last, :amount, 'EUR', 'AWAITING_PAYMENT', :stay)
				RETURNING id
				""").param("code", rowCode).param("v", set.venueId()).param("set", set.setId()).param("c", customer)
				.param("first", first).param("last", first.plusDays(1)).param("amount", STRETCH_AMOUNT)
				.param("stay", stay).query(Long.class).single();
	}

	/** One verified payment per stretch, each committed by its own thread, released together. */
	private void confirmConcurrently(List<Long> stretches) throws Exception {
		TransactionTemplate transactions = new TransactionTemplate(txManager);
		CountDownLatch gate = new CountDownLatch(1);
		try (ExecutorService pool = Executors.newFixedThreadPool(stretches.size())) {
			List<Future<?>> published = stretches.stream().<Future<?>>map(stretch -> pool.submit(() -> {
				gate.await();
				transactions.executeWithoutResult(status -> publisher.publishEvent(
						new PaymentConfirmed(new BookingRef(stretch), "pi_stay_" + stretch)));
				return null;
			})).toList();
			gate.countDown();
			for (Future<?> future : published) {
				future.get(30, TimeUnit.SECONDS);
			}
		}
	}

	private long count(String email, SentEmail.Kind kind) {
		return mailer.sent().stream().filter(e -> e.kind() == kind).filter(e -> e.toEmail().equals(email)).count();
	}

	private long automaticSentAttempts(List<Long> stretches) {
		return jdbc.sql("""
				SELECT count(*) FROM booking_confirmation_mail_attempt
				WHERE booking_id IN (:ids) AND trigger_source = 'AUTOMATIC' AND outcome = 'SENT'
				""").param("ids", stretches).query(Long.class).single();
	}
}
