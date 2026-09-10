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
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.remodel.NewReceipt;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcome;
import ai.riviera.platform.booking.application.remodel.ReceiptOutcomeKind;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The cancellation/refund email end-to-end — the {@code notification} listener on
 * {@code BookingCancelled}, through the Event Publication Registry, to the recording
 * {@link MockMailer}:
 *
 * <ul>
 *   <li><strong>AC-1:</strong> a real tourist self-service cancel — booked and cancelled over HTTP,
 *       with the refund decided by the server — yields exactly one {@code BOOKING_CANCELLATION} to
 *       the booking's contact, carrying the amount the API itself reported.</li>
 *   <li><strong>AC-3:</strong> the operator weather refund is the other publisher of the same event,
 *       and its mail says so — one listener, both channels, distinguishable by the tourist.</li>
 *   <li><strong>AC-5:</strong> resubmitting outstanding publications — what
 *       {@code republish-outstanding-events-on-restart} does at boot — produces no second email.</li>
 *   <li><strong>AC-7:</strong> a suppressed address is skipped, and the publication <em>completes</em>
 *       rather than parking in a permanent retry loop.</li>
 *   <li><strong>AC-9:</strong> the registry writes the listener id this module's admin re-drive scopes
 *       on — the live half of the two-link chain {@code MailOutboxScopeTest} holds the other end of.</li>
 * </ul>
 *
 * <p><strong>Dates are unique to this class, deliberately.</strong> Classes sharing this context
 * share one container and one online set, and a claimed {@code (set, date)} is never released
 * (invariant #2) — so a date another IT books would 409 whichever class ran second.
 * {@code BookingConfirmationMailIT} sits on 2029-06-12..15 and {@code plusYears(1).plusDays(23)};
 * this class takes 2029-07-xx and its own offset.
 *
 * <p>Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class BookingCancellationMailIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MockMailer mailer;

	@Autowired
	RemodelReceipts receipts;

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	IncompleteEventPublications incompletePublications;

	private BookingMailFixtures fixtures;

	private record SetRef(long setId, long venueId, String venueName) {
	}

	@BeforeEach
	void isolateOutbox() {
		mailer.clear();
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
	}

	/**
	 * AC-1, driven through the API rather than by publishing the event by hand: the refund asserted on
	 * is the one the server computed and told the tourist (invariant #10), so a listener that invented
	 * its own number could not pass. Cancelling well before the date makes it the full amount
	 * (ADR-0005 tier {@code FULL}).
	 */
	@Test
	void mailsTheGuestOneCancellationRecord() throws Exception {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.now().plusYears(1).plusDays(37);
		String guest = "cancel-me@example.com";

		String created = mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"setId": %d, "bookingDate": "%s",
								 "contact": {"email": "%s", "fullName": "Leaving Guest", "phone": "+355699"}}
								""".formatted(set.setId(), date, guest)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		String code = JsonPath.read(created, "$.code");
		mailer.clear();

		String cancelled = mvc.perform(post("/api/bookings/%s/cancel".formatted(code)))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		long refundMinor = ((Number) JsonPath.read(cancelled, "$.refund.minorUnits")).longValue();

		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);

		SentEmail sent = mailer.lastTo(guest).orElseThrow();
		assertThat(sent.kind()).isEqualTo(SentEmail.Kind.BOOKING_CANCELLATION);
		assertThat(sent.cancellation()).isEqualTo(new BookingCancellationMail(
				code, set.venueName(), date, refundMinor, "EUR", RefundReason.POLICY, null));
		assertThat(refundMinor).as("cancelled long before the cutoff — ADR-0005 tier FULL").isPositive();
	}

	/**
	 * AC-3. The weather refund is the operator-triggered publisher of the same event; what the tourist
	 * must be able to tell apart is the reason, since this is a cancellation they never asked for. The
	 * event is published directly rather than through the venue-scoped admin endpoint because the
	 * channel's authorization (invariant #13) is {@code WeatherRefundServiceIT}'s subject, not this
	 * listener's — here the event <em>is</em> the seam.
	 */
	@Test
	void coversBothCancellationChannels() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 7, 11);
		String guest = "washed-out@example.com";

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"WEATHER1", date, guest, 7331L, "CANCELLED");
		fixtures.publishInTransaction(fixtures.cancellationOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 7331L,
				RefundReason.WEATHER));

		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);

		assertThat(mailer.lastTo(guest).orElseThrow().cancellation())
				.isEqualTo(new BookingCancellationMail("WEATHER1", set.venueName(), date, 7331L, "EUR",
						RefundReason.WEATHER, null));
	}

	/**
	 * AC-5 — the whole idempotency story, since there is deliberately no dedupe table: the registry
	 * completes the publication on the listener's normal return, and only NULL-{@code completion_date}
	 * rows are resubmitted.
	 */
	@Test
	void resubmissionProducesNoSecondMail() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 7, 12);
		String guest = "replay-cancel@example.com";

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"REPLAYC1", date, guest, 7332L, "CANCELLED");
		fixtures.publishInTransaction(fixtures.cancellationOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 7332L,
				RefundReason.POLICY));
		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);

		incompletePublications.resubmitIncompletePublications(publication -> true);

		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT).until(() -> countTo(guest) == 1L);
	}

	/**
	 * AC-7. The skip must leave <em>no</em> outstanding publication: on this vehicle a throw would park
	 * the row in a retry loop against an address the policy keeps refusing (R-6). Archive mode moves
	 * completed rows out, so "no outstanding row" is how a completed skip reads.
	 */
	@Test
	void aSuppressedAddressIsSkippedAndThePublicationCompletes() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 7, 13);
		String suppressed = "suppressed-cancel@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"SUPPCAN1", date, suppressed, 7333L, "CANCELLED");
		fixtures.publishInTransaction(fixtures.cancellationOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 7333L,
				RefundReason.POLICY));

		Awaitility.await().atMost(WAIT).until(() -> fixtures.outstandingPublicationsFor(
				BookingMailFixtures.CANCELLATION_LISTENER_ID, 7333L) == 0L);
		assertThat(countTo(suppressed)).isZero();
	}

	/**
	 * AC-9, live half. {@code MailOutboxScopeTest} pins the module prefix against the constant below;
	 * this pins the constant against the id the running registry actually writes. Both links are
	 * needed — a constant that drifts from reality makes the admin re-drive silently skip every
	 * cancellation mail it is supposed to reach.
	 *
	 * <p><strong>Read from {@code event_publication_archive}, not {@code event_publication}.</strong>
	 * The deployment runs {@code completion-mode=archive} (V8 ships both tables), so a delivered mail's
	 * row is <em>moved</em> the moment the listener returns and the live table is empty by the time
	 * this asserts. {@code RegistryMailBulkheadIT} reads the live table instead because it wedges the
	 * transport first, deliberately keeping the row outstanding; here the send succeeds, so the archive
	 * is the only place the id exists — and it is the better one to check, since it is the id a
	 * <em>completed</em> publication is recorded under.
	 */
	@Test
	void theRegistryWritesTheListenerIdTheReDriveScopesOn() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 7, 14);
		String guest = "listener-id@example.com";

		long bookingId = fixtures.seedBooking(new BookingMailFixtures.SetRef(set.setId(), set.venueId()),
				"LISTENID", date, guest, 7334L, "CANCELLED");
		fixtures.publishInTransaction(fixtures.cancellationOf(
				new BookingMailFixtures.SetRef(set.setId(), set.venueId()), bookingId, date, 7334L,
				RefundReason.POLICY));
		Awaitility.await().atMost(WAIT).until(() -> countTo(guest) == 1L);

		assertThat(jdbc.sql("SELECT DISTINCT listener_id FROM event_publication_archive "
						+ "WHERE serialized_event LIKE :fragment AND listener_id LIKE :module")
				.param("fragment", "%7334%")
				.param("module", "ai.riviera.platform.notification.%")
				.query(String.class).list())
				.containsExactly(BookingMailFixtures.CANCELLATION_LISTENER_ID);
	}

	/**
	 * The venue-caused legs: a booking a remodel receipt records as ended carries a way to book again
	 * — that venue's map for the day it can still sell, the discovery list for one it cannot.
	 */
	@Test
	void aVenueCausedCancellationCarriesTheRebookLinkAndFallsBackToDiscovery() {
		SetRef set = onlineSet();
		LocalDate sellable = LocalDate.of(2029, 7, 15);
		LocalDate unsellable = LocalDate.of(2020, 7, 15);
		String onOpenDay = "remodelled-open@example.com";
		String onClosedDay = "remodelled-closed@example.com";
		BookingMailFixtures.SetRef ref = new BookingMailFixtures.SetRef(set.setId(), set.venueId());

		long sellableBooking = fixtures.seedBooking(ref, "REBOOK01", sellable, onOpenDay, 7335L, "CANCELLED");
		endedByRemodel(set, sellableBooking, sellable);
		fixtures.publishInTransaction(fixtures.cancellationOf(ref, sellableBooking, sellable, 7335L,
				RefundReason.VENUE_CHANGE));
		Awaitility.await().atMost(WAIT).until(() -> countTo(onOpenDay) == 1L);
		assertThat(mailer.lastTo(onOpenDay).orElseThrow().cancellation().rebookLink())
				.hasToString("http://localhost:4200/venues/" + set.venueId() + "?date=" + sellable);

		long pastBooking = fixtures.seedBooking(ref, "REBOOK02", unsellable, onClosedDay, 7336L, "CANCELLED");
		endedByRemodel(set, pastBooking, unsellable);
		fixtures.publishInTransaction(fixtures.cancellationOf(ref, pastBooking, unsellable, 7336L,
				RefundReason.VENUE_CHANGE));
		Awaitility.await().atMost(WAIT).until(() -> countTo(onClosedDay) == 1L);
		assertThat(mailer.lastTo(onClosedDay).orElseThrow().cancellation().rebookLink())
				.hasToString("http://localhost:4200/?date=" + unsellable);
	}

	/** A suppressed address is skipped on this leg too, and the publication still completes. */
	@Test
	void aSuppressedAddressIsSkippedOnTheVenueCausedLegToo() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2029, 7, 16);
		String suppressed = "suppressed-remodel@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());
		BookingMailFixtures.SetRef ref = new BookingMailFixtures.SetRef(set.setId(), set.venueId());

		long bookingId = fixtures.seedBooking(ref, "SUPPREM1", date, suppressed, 7337L, "CANCELLED");
		endedByRemodel(set, bookingId, date);
		fixtures.publishInTransaction(fixtures.cancellationOf(ref, bookingId, date, 7337L,
				RefundReason.VENUE_CHANGE));

		Awaitility.await().atMost(WAIT).until(() -> fixtures.outstandingPublicationsFor(
				BookingMailFixtures.CANCELLATION_LISTENER_ID, 7337L) == 0L);
		assertThat(countTo(suppressed)).isZero();
	}

	/** The receipt line a commit writes for a claim it refunded — what {@code endedByRemodel} reads. */
	private void endedByRemodel(SetRef set, long bookingId, LocalDate date) {
		receipts.store(new NewReceipt(new VenueId(set.venueId()), new OperatorId(anOperator()), Instant.now(),
				List.of(), List.of(new ReceiptOutcome(new BookingId(bookingId), date,
						new SpotRef(new SetId(set.setId()), "A", 1), ReceiptOutcomeKind.REFUND, 7335L, "EUR")),
				"Re-laying row A"));
	}

	private long anOperator() {
		return jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "rebook-" + System.nanoTime()).query(Long.class).single();
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

	private long countTo(String email) {
		return mailer.sent().stream()
				.filter(e -> e.kind() == SentEmail.Kind.BOOKING_CANCELLATION)
				.filter(e -> e.toEmail().equals(email))
				.count();
	}
}
