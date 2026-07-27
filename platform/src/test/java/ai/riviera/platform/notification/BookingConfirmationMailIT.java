package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The booking-confirmation email end-to-end (#371, Email S3) — the edge listener on
 * {@code BookingConfirmed}, through the Event Publication Registry, to the recording
 * {@link MockMailer}:
 *
 * <ul>
 *   <li><strong>AC-1:</strong> a real Instant-Book guest checkout yields exactly one
 *       {@code BOOKING_CONFIRMATION} to the contact address, carrying code, venue, date, spot and
 *       the gross amount.</li>
 *   <li><strong>AC-2:</strong> a booking made while signed in still mails the <em>guest contact</em>
 *       — {@code booking.account_id} is never consulted (design D-6).</li>
 *   <li><strong>AC-3:</strong> a booking confirmed through the asynchronous <em>payment</em> route —
 *       the tail shared by Request-mode pay-on-accept and the Stripe webhook (invariant #8) — mails
 *       the same single confirmation, so the listener is path-agnostic rather than coupled to
 *       Instant Book.</li>
 *   <li><strong>AC-4:</strong> resubmitting outstanding publications — what
 *       {@code republish-outstanding-events-on-restart} does at boot — produces no second email,
 *       because the registry never redelivers a publication it has already completed. This is the
 *       whole idempotency story: there is no dedupe table, by design.</li>
 * </ul>
 *
 * <p>Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class BookingConfirmationMailIT {

	private static final Duration WAIT = Duration.ofSeconds(15);
	private static final String GUEST_EMAIL = "confirm-me@example.com";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MockMailer mailer;

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	IncompleteEventPublications incompletePublications;

	private record SetRef(long setId, long venueId, String venueName, String rowLabel, int positionNo) {
	}

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
	}

	private SetRef onlineSet() {
		return jdbc.sql("""
				SELECT sp.id, sp.venue_id, v.name, sp.row_label, sp.position_no
				FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE sp.pool = 'ONLINE' ORDER BY sp.id LIMIT 1
				""")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"),
						rs.getString("name"), rs.getString("row_label"), rs.getInt("position_no")))
				.single();
	}

	private long countTo(String email) {
		return mailer.sent().stream()
				.filter(e -> e.kind() == SentEmail.Kind.BOOKING_CONFIRMATION)
				.filter(e -> e.toEmail().equals(email))
				.count();
	}

	/** Publish inside a transaction so the AFTER_COMMIT registry-backed listeners are triggered. */
	private void publishInTransaction(Object event) {
		new TransactionTemplate(txManager).executeWithoutResult(status -> publisher.publishEvent(event));
	}

	/**
	 * Seed a guest contact plus a booking on {@code set}. The four SQL-seeded tests below differed only
	 * in code, date, amount, status and whether an account is linked, so this lived in four
	 * near-identical copies — and the newest copy silently reused another test's booking date, breaking
	 * the unique-date discipline the whole class depends on (see the comment on the first test: classes
	 * sharing this context share one container and one online set, and a claimed {@code (set, date)} is
	 * never released, invariant #2).
	 *
	 * @param accountId the linked customer account, or {@code null} for a guest booking
	 */
	private long seedBooking(SetRef set, String code, LocalDate date, String contactEmail,
			long amountMinor, String status, Long accountId) {
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Test Guest', '+355777') RETURNING id")
				.param("e", contactEmail).query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :account, :date, :amount, 'EUR', :status)
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customerId).param("account", accountId).param("date", date)
				.param("amount", amountMinor).param("status", status)
				.query(Long.class).single();
	}

	/** The common case: a confirmed guest booking, no linked account. */
	private long seedConfirmedBooking(SetRef set, String code, LocalDate date, String contactEmail,
			long amountMinor) {
		return seedBooking(set, code, date, contactEmail, amountMinor, "CONFIRMED", null);
	}

	@Test
	void sendsOneConfirmationCarryingCodeVenueDateSetAndAmount() throws Exception {
		SetRef set = onlineSet();
		// A date no other IT books. Classes sharing this context key share one container, and a claimed
		// (set, date) is never released (invariant #2), so reusing BookingControllerIT's
		// plusYears(1) on the same first ONLINE set would 409 whichever class ran second. The suite's
		// other create-booking ITs offset by hand for the same reason (+7, +11 days).
		LocalDate date = LocalDate.now().plusYears(1).plusDays(23);

		String response = mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"setId": %d, "bookingDate": "%s",
								 "contact": {"email": "%s", "fullName": "Holiday Guest", "phone": "+355699"}}
								""".formatted(set.setId(), date, GUEST_EMAIL)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();

		String code = JsonPath.read(response, "$.code");
		long amountMinor = ((Number) JsonPath.read(response, "$.amount.minorUnits")).longValue();

		Awaitility.await().atMost(WAIT).until(() -> countTo(GUEST_EMAIL) == 1L);

		SentEmail sent = mailer.lastTo(GUEST_EMAIL).orElseThrow();
		assertThat(sent.kind()).isEqualTo(SentEmail.Kind.BOOKING_CONFIRMATION);
		assertThat(sent.confirmation()).isEqualTo(new BookingConfirmationMail(
				code, set.venueName(), date, set.rowLabel(), set.positionNo(), amountMinor, "EUR"));
	}

	@Test
	void sendsToTheBookingContactForASignedInBooking() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 6, 12);
		String contactEmail = "guest-contact@example.com";

		// The account's address is deliberately DIFFERENT from the booking's guest contact: if the
		// listener ever resolved through account_id, this test fails loudly instead of passing by luck.
		long accountId = jdbc.sql("INSERT INTO customer_account (email, password_hash) "
						+ "VALUES ('signed-in-account@example.com', '{bcrypt}$2a$10$notarealhash') RETURNING id")
				.query(Long.class).single();
		long bookingId = seedBooking(set, "SIGNEDIN", date, contactEmail, 3200L, "CONFIRMED", accountId);

		publishInTransaction(new BookingConfirmed(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, 3200L, "EUR"));

		Awaitility.await().atMost(WAIT).until(() -> countTo(contactEmail) == 1L);
		assertThat(countTo("signed-in-account@example.com"))
				.as("the guest contact is the recipient; account_id is never consulted (D-6)")
				.isZero();
	}

	@Test
	void sendsForABookingConfirmedViaThePaymentPath() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 6, 14);
		String contactEmail = "paid-on-accept@example.com";

		long bookingId = seedBooking(set, "PAIDPATH", date, contactEmail, 4400L, "AWAITING_PAYMENT", null);

		// The asynchronous confirm route: a signature-verified payment (invariant #8) drives
		// booking's PaymentEventListener → ConfirmBooking → BookingConfirmed. That is the tail of
		// Request-mode pay-on-accept as well as of the Stripe-webhook path, and it is the one confirm
		// route this listener does not otherwise see — proving it is path-agnostic.
		publishInTransaction(new PaymentConfirmed(new BookingRef(bookingId), "pi_test_confirm"));

		Awaitility.await().atMost(WAIT).until(() -> countTo(contactEmail) == 1L);
		assertThat(mailer.lastTo(contactEmail).orElseThrow().confirmation())
				.isEqualTo(new BookingConfirmationMail("PAIDPATH", set.venueName(), date,
						set.rowLabel(), set.positionNo(), 4400L, "EUR"));
	}

	@Test
	void suppressedAddressCompletesWithoutSend() {
		SetRef set = onlineSet();
		// 06-15, not 06-14: this test was added last and reused sendsForABookingConfirmedViaThePaymentPath's
		// date, which the class's unique-date discipline forbids (#386 cleanup).
		LocalDate date = LocalDate.of(2029, 6, 15);
		String suppressed = "suppressed-tourist@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());

		long bookingId = seedConfirmedBooking(set, "SUPPRESS1", date, suppressed, 2100L);

		publishInTransaction(new BookingConfirmed(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, 2100L, "EUR"));

		// Archive mode moves completed rows out, so no-outstanding-row = the skip COMPLETED (AC-5, R-6).
		Awaitility.await().atMost(WAIT).until(() -> jdbc.sql(
				"SELECT count(*) FROM event_publication WHERE completion_date IS NULL "
						+ "AND listener_id LIKE '%BookingConfirmationMailListener%'")
				.query(Long.class).single() == 0L);
		assertThat(countTo(suppressed)).isZero();
	}

	@Test
	void doesNotResendWhenACompletedPublicationIsResubmitted() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 6, 13);
		String contactEmail = "replay-me@example.com";

		long bookingId = seedConfirmedBooking(set, "REPLAY01", date, contactEmail, 2100L);

		publishInTransaction(new BookingConfirmed(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, 2100L, "EUR"));
		Awaitility.await().atMost(WAIT).until(() -> countTo(contactEmail) == 1L);

		// Exactly what republish-outstanding-events-on-restart does at boot. The publication this
		// listener just completed is not outstanding, so nothing is redelivered.
		incompletePublications.resubmitIncompletePublications(publication -> true);

		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> countTo(contactEmail) == 1L);
	}
}
