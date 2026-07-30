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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin mail-delivery view and resend end-to-end (#380, Email S9) — from the ADMIN endpoint through
 * the module's ports to real Postgres and the recording {@link MockMailer}:
 *
 * <ul>
 *   <li><strong>AC-1:</strong> a confirmed booking's automatic send shows up as one {@code AUTOMATIC}
 *       attempt against the address it was sent to, with its outcome and instant.</li>
 *   <li><strong>AC-2:</strong> a suppressed address's attempt reads {@code WITHHELD_SUPPRESSED} — the
 *       case a registry-derived view would have reported as "dispatched", and the whole reason the
 *       attempt log exists.</li>
 *   <li><strong>AC-3:</strong> a resend for a booking whose publication already <em>completed</em>
 *       mails the tourist again — the support case a restart cannot fix.</li>
 *   <li><strong>AC-4:</strong> that resend publishes no {@code BookingConfirmed}, so the payout ledger
 *       (invariant #9) is untouched. The most important assertion in the class: it is the one way this
 *       slice could do real damage.</li>
 *   <li><strong>AC-7:</strong> an address with no bookings answers {@code 200} with an empty list.</li>
 * </ul>
 *
 * <p>The role gate, the request-validation {@code 400} and every resend outcome token are covered
 * Docker-free by {@code AdminMailDeliveryControllerTest}; this class is the wiring and the data.
 *
 * <p>Unique {@code (set, date)} per test, like every IT sharing this context: a claimed pair is never
 * released (invariant #2), so reusing another class's date would 409 whichever ran second.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class AdminMailDeliveryIT {

	private static final Duration WAIT = Duration.ofSeconds(15);
	private static final String LOOKUP = "/api/admin/mail-deliveries/lookup";

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

	private record SetRef(long setId, long venueId, String venueName) {
	}

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
	}

	@Test
	void listsTheAutomaticAttemptForTheAddressesBookings() throws Exception {
		String email = "delivery-listed@example.com";
		SetRef set = onlineSet();
		long bookingId = seedConfirmedBooking(set, "MDLIST01", LocalDate.of(2031, 6, 1), email, 4500L);

		confirm(bookingId, set, LocalDate.of(2031, 6, 1), 4500L);
		Awaitility.await().atMost(WAIT).until(() -> confirmationsTo(email) == 1L);

		lookup(email)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.bookings[0].bookingId").value(bookingId))
				.andExpect(jsonPath("$.bookings[0].venueName").value(set.venueName()))
				.andExpect(jsonPath("$.bookings[0].bookingDate").value("2031-06-01"))
				.andExpect(jsonPath("$.bookings[0].everConfirmed").value(true))
				.andExpect(jsonPath("$.bookings[0].attempts[0].source").value("AUTOMATIC"))
				.andExpect(jsonPath("$.bookings[0].attempts[0].outcome").value("SENT"))
				.andExpect(jsonPath("$.bookings[0].attempts[0].attemptedAt").exists());
	}

	/**
	 * The registry completes this publication exactly as it completes a delivery, so {@code completion_date}
	 * would call it dispatched. The attempt row is the only thing that says otherwise.
	 */
	@Test
	void showsAWithheldAttemptForASuppressedAddress() throws Exception {
		String email = "delivery-suppressed@example.com";
		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, Instant.now());
		SetRef set = onlineSet();
		long bookingId = seedConfirmedBooking(set, "MDSUPP01", LocalDate.of(2031, 6, 2), email, 2100L);

		confirm(bookingId, set, LocalDate.of(2031, 6, 2), 2100L);
		Awaitility.await().atMost(WAIT).until(() -> recordedAttempts(bookingId) == 1L);

		lookup(email)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.bookings[0].attempts[0].outcome").value("WITHHELD_SUPPRESSED"));
		assertThat(confirmationsTo(email)).isZero();
	}

	@Test
	void resendsTheConfirmationForABookingWhoseMailAlreadyCompleted() throws Exception {
		String email = "delivery-resend@example.com";
		SetRef set = onlineSet();
		long bookingId = seedConfirmedBooking(set, "MDRSND01", LocalDate.of(2031, 6, 3), email, 3300L);

		confirm(bookingId, set, LocalDate.of(2031, 6, 3), 3300L);
		Awaitility.await().atMost(WAIT).until(() -> confirmationsTo(email) == 1L);
		awaitNoOutstandingConfirmationPublication();

		resend(bookingId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("SENT"));

		assertThat(confirmationsTo(email))
				.as("the tourist gets the confirmation again — a completed publication is what a restart cannot fix")
				.isEqualTo(2L);
		assertThat(mailer.lastTo(email).orElseThrow().confirmation().bookingCode())
				.as("the same arrival code, rebuilt from the booking's own facts")
				.isEqualTo("MDRSND01");
		lookup(email)
				.andExpect(jsonPath("$.bookings[0].attempts[0].source").value("ADMIN_RESEND"))
				.andExpect(jsonPath("$.bookings[0].attempts[0].outcome").value("SENT"))
				.andExpect(jsonPath("$.bookings[0].attempts[1].source").value("AUTOMATIC"));
	}

	/**
	 * <strong>AC-4.</strong> A resend must not re-drive any other {@code BookingConfirmed} consumer:
	 * {@code payout}'s accrual is idempotent per booking (invariant #9), but the refund path is not the
	 * only thing at stake — replaying the event is money-path work an admin never asked for. The
	 * structural guarantee is that nothing is published at all, and this asserts both halves: the ledger
	 * is unchanged, and the registry gained no new publication.
	 */
	@Test
	void resendDrivesNoOtherBookingConfirmedConsumer() throws Exception {
		String email = "delivery-no-fanout@example.com";
		SetRef set = onlineSet();
		long bookingId = seedConfirmedBooking(set, "MDNOFAN1", LocalDate.of(2031, 6, 4), email, 5000L);

		confirm(bookingId, set, LocalDate.of(2031, 6, 4), 5000L);
		Awaitility.await().atMost(WAIT).until(() -> ledgerEntriesFor(bookingId) == 1L);
		long publicationsBefore = confirmationPublications();

		resend(bookingId).andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value("SENT"));

		assertThat(ledgerEntriesFor(bookingId))
				.as("the payout ledger must be untouched by a mail resend (invariant #9)")
				.isEqualTo(1L);
		assertThat(confirmationPublications())
				.as("no BookingConfirmed was published, so no consumer could have run")
				.isEqualTo(publicationsBefore);
	}

	@Test
	void refusesToResendABookingThatWasNeverConfirmed() throws Exception {
		String email = "delivery-unconfirmed@example.com";
		SetRef set = onlineSet();
		long bookingId = seedBooking(set, "MDUNCON1", LocalDate.of(2031, 6, 5), email, 2500L, "AWAITING_PAYMENT");

		resend(bookingId)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("NOT_CONFIRMED"));

		assertThat(confirmationsTo(email))
				.as("mailing \"your booking is confirmed\" for an unpaid booking would be untrue")
				.isZero();
		assertThat(recordedAttempts(bookingId)).isZero();
		lookup(email).andExpect(jsonPath("$.bookings[0].everConfirmed").value(false));
	}

	@Test
	void answersAnEmptyListForAnAddressWithNoBookings() throws Exception {
		lookup("nobody-booked-this@example.com")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.bookings").isEmpty());
	}

	@Test
	void reportsNoSuchBookingForAnUnknownId() throws Exception {
		resend(-1L)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("NO_SUCH_BOOKING"));
	}

	/** Invariant #7: the arrival code is a bearer credential and never appears in this surface's output. */
	@Test
	void neverRendersTheArrivalCode() throws Exception {
		String email = "delivery-no-code@example.com";
		SetRef set = onlineSet();
		seedConfirmedBooking(set, "MDNOCODE", LocalDate.of(2031, 6, 6), email, 2500L);

		String body = lookup(email).andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();

		assertThat(body).doesNotContain("MDNOCODE").doesNotContain(email);
	}

	private ResultActions lookup(String email) throws Exception {
		return mvc.perform(post(LOOKUP).with(user("operator").roles("ADMIN")).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\"}".formatted(email)));
	}

	private ResultActions resend(long bookingId) throws Exception {
		return mvc.perform(post("/api/admin/mail-deliveries/{id}/resend", bookingId)
				.with(user("operator").roles("ADMIN")).with(csrf()));
	}

	/** Publish inside a transaction so the AFTER_COMMIT registry-backed listeners are triggered. */
	private void confirm(long bookingId, SetRef set, LocalDate date, long amountMinor) {
		new TransactionTemplate(txManager).executeWithoutResult(status -> publisher.publishEvent(
				new BookingConfirmed(new BookingId(bookingId), new VenueId(set.venueId()),
						new SetId(set.setId()), date, amountMinor, "EUR")));
	}

	private void awaitNoOutstandingConfirmationPublication() {
		Awaitility.await().atMost(WAIT).until(() -> jdbc.sql(
				"SELECT count(*) FROM event_publication WHERE completion_date IS NULL "
						+ "AND listener_id LIKE '%BookingConfirmationMailListener%'")
				.query(Long.class).single() == 0L);
	}

	private long confirmationPublications() {
		return jdbc.sql("SELECT count(*) FROM event_publication WHERE event_type LIKE '%BookingConfirmed'")
				.query(Long.class).single()
				+ jdbc.sql("SELECT count(*) FROM event_publication_archive WHERE event_type LIKE '%BookingConfirmed'")
				.query(Long.class).single();
	}

	private long ledgerEntriesFor(long bookingId) {
		return jdbc.sql("SELECT count(*) FROM payout_ledger_entry WHERE booking_id = :id")
				.param("id", bookingId).query(Long.class).single();
	}

	private long recordedAttempts(long bookingId) {
		return jdbc.sql("SELECT count(*) FROM booking_confirmation_mail_attempt WHERE booking_id = :id")
				.param("id", bookingId).query(Long.class).single();
	}

	private long confirmationsTo(String email) {
		return mailer.sent().stream()
				.filter(sent -> sent.kind() == SentEmail.Kind.BOOKING_CONFIRMATION)
				.filter(sent -> sent.toEmail().equals(email))
				.count();
	}

	private SetRef onlineSet() {
		return jdbc.sql("""
				SELECT sp.id, sp.venue_id, v.name
				FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE sp.pool = 'ONLINE' ORDER BY sp.id LIMIT 1
				""")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"), rs.getString("name")))
				.single();
	}

	private long seedBooking(SetRef set, String code, LocalDate date, String email, long amountMinor,
			String status) {
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Delivery Guest', '+355777') RETURNING id")
				.param("e", email).query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, :amount, 'EUR', :status)
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customerId).param("date", date).param("amount", amountMinor)
				.param("status", status)
				.query(Long.class).single();
	}

	/** A booking that really went through the confirm transition — {@code confirmed_at} stamped. */
	private long seedConfirmedBooking(SetRef set, String code, LocalDate date, String email, long amountMinor) {
		long bookingId = seedBooking(set, code, date, email, amountMinor, "CONFIRMED");
		jdbc.sql("UPDATE booking SET confirmed_at = NOW() WHERE id = :id").param("id", bookingId).update();
		return bookingId;
	}
}
