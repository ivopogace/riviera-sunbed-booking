package ai.riviera.platform.notification;

import java.net.URI;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The bulkhead between transactional mail and the money path (#383).
 *
 * <p>{@code @ApplicationModuleListener} expands to a bare {@code @Async}, which is Boot's shared
 * {@code applicationTaskExecutor} — the pool that also carries {@code booking}'s
 * {@code PaymentEventListener} (invariant #8) and {@code payout}'s accrual listener (invariant #9).
 * #369 built the recovery dispatcher its own pool precisely so a degraded relay could not back up
 * that spine, then #371 put a per-confirmed-booking send back on the shared one. These tests hold the
 * fix in place from four angles:
 *
 * <ul>
 *   <li><strong>AC-1</strong> — with every mail thread wedged on an unresponsive transport, a
 *       payment still confirms its booking and still accrues its payout.</li>
 *   <li><strong>AC-3</strong> — the decomposition into explicit annotations did not cost the Event
 *       Publication Registry its grip: a failed send still leaves the publication <em>outstanding</em>
 *       and a resubmit still re-delivers it. Losing this silently would turn at-least-once into
 *       fire-and-forget, which is why #383 exists as its own slice rather than a line in #371.</li>
 *   <li><strong>AC-5</strong> — the registry's {@code listener_id} still reads exactly as V31 (#382)
 *       migrated it. The id embeds the listener FQCN and signature, and republication matches it
 *       string-equal, so a drift here dead-letters every outstanding row.</li>
 *   <li><strong>AC-7</strong> — the send holds no transaction, and therefore no pooled connection,
 *       for the duration of the SMTP round-trip.</li>
 * </ul>
 *
 * <p>The nested {@link ControllableMailerConfiguration} gives this class its <strong>own</strong>
 * Spring context rather than the suite's shared one — deliberate: a test that deliberately wedges a
 * thread pool must not hand that pool to the next class in the run. The gate is released
 * unconditionally in {@link #releaseTransport()}. Bookings are SQL-seeded on dates no other IT uses,
 * following this package's unique-date discipline (a claimed {@code (set, date)} is never released,
 * invariant #2), and never claimed through {@code availability}. Testcontainers; skipped where Docker
 * is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RegistryMailBulkheadIT {

	private static final Duration WAIT = Duration.ofSeconds(20);

	/**
	 * How long a wedged send stays wedged if {@link #releaseTransport()} somehow never runs. It must
	 * comfortably outlast every {@link #WAIT} in a single test — a gate that reopens on its own part-way
	 * through unwedges the pool and lets the money-path assertions pass for the wrong reason, which is
	 * how the first draft of this class went green against the unfixed listener. It is a deadlock
	 * backstop, not a timing knob.
	 */
	private static final Duration GATE_BACKSTOP = Duration.ofMinutes(2);

	/**
	 * More wedged sends than Boot's stock {@code applicationTaskExecutor} core pool (8), so that before
	 * the fix the shared pool is genuinely exhausted rather than merely busy — that is what makes the
	 * money-path assertion below fail loudly instead of flaking.
	 */
	private static final int WEDGED_SENDS = 10;

	private static final String LISTENER_ID = "ai.riviera.platform.notification.adapter.in."
			+ "BookingConfirmationMailListener.on(ai.riviera.platform.booking.events.BookingConfirmed)";

	@TestConfiguration(proxyBeanMethods = false)
	static class ControllableMailerConfiguration {

		@Bean
		@Primary
		ControllableMailer controllableMailer() {
			return new ControllableMailer();
		}
	}

	/**
	 * A transport whose latency and failure are the test's to choose — the "deliberately blocking
	 * mailer" #383's AC-1 asks for. It also records whether a transaction was active on the sending
	 * thread, which is AC-7's whole assertion.
	 */
	static final class ControllableMailer implements Mailer {

		/**
		 * Replaced per test, not merely counted down: a {@link CountDownLatch} is single-use, so one
		 * shared instance would stay open for every test after the first release and silently stop
		 * blocking anything — a wedging test that wedges nothing still passes its money-path assertions.
		 */
		private volatile CountDownLatch gate = new CountDownLatch(1);

		private final AtomicBoolean blocking = new AtomicBoolean();
		private final AtomicBoolean failing = new AtomicBoolean();
		private final List<String> entered = new CopyOnWriteArrayList<>();
		private final List<String> delivered = new CopyOnWriteArrayList<>();
		private final List<Boolean> transactionActive = new CopyOnWriteArrayList<>();

		@Override
		public void sendEmailVerification(String toEmail, URI verificationLink) {
			// Not exercised here; the recovery vehicle has its own pool (#369) and its own tests.
		}

		@Override
		public void sendPasswordReset(String toEmail, URI resetLink) {
			// See above.
		}

		@Override
		public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
			entered.add(toEmail);
			transactionActive.add(TransactionSynchronizationManager.isActualTransactionActive());
			if (blocking.get()) {
				awaitGate();
			}
			if (failing.get()) {
				throw new IllegalStateException("transport unavailable (test)");
			}
			delivered.add(toEmail);
		}

		private void awaitGate() {
			try {
				gate.await(GATE_BACKSTOP.toSeconds(), TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
		}

		void block() {
			blocking.set(true);
		}

		void failEverySend(boolean fail) {
			failing.set(fail);
		}

		void release() {
			blocking.set(false);
			gate.countDown();
		}

		void reset() {
			entered.clear();
			delivered.clear();
			transactionActive.clear();
			blocking.set(false);
			failing.set(false);
			gate = new CountDownLatch(1);
		}

		long attemptsMatching(String addressPrefix) {
			return entered.stream().filter(address -> address.startsWith(addressPrefix)).count();
		}

		long deliveriesMatching(String addressPrefix) {
			return delivered.stream().filter(address -> address.startsWith(addressPrefix)).count();
		}

		List<Boolean> transactionActive() {
			return List.copyOf(transactionActive);
		}
	}

	@Autowired
	ControllableMailer transport;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	IncompleteEventPublications incompletePublications;

	private record SetRef(long setId, long venueId) {
	}

	@BeforeEach
	void resetTransport() {
		transport.reset();
	}

	@AfterEach
	void releaseTransport() {
		transport.release();
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long seedBooking(SetRef set, String code, LocalDate date, String contactEmail, long amountMinor,
			String status) {
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Bulkhead Guest', '+355781') RETURNING id")
				.param("e", contactEmail).query(Long.class).single();
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

	/** Publish inside a transaction so the AFTER_COMMIT registry-backed listeners are triggered. */
	private void publishInTransaction(Object event) {
		new TransactionTemplate(txManager).executeWithoutResult(status -> publisher.publishEvent(event));
	}

	private BookingConfirmed confirmationOf(SetRef set, long bookingId, LocalDate date, long amountMinor) {
		return new BookingConfirmed(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, amountMinor, "EUR");
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	private long accrualsFor(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	private long outstandingMailPublications(long bookingId) {
		return jdbc.sql("""
				SELECT COUNT(*) FROM event_publication
				WHERE completion_date IS NULL AND listener_id = :listener
				  AND serialized_event LIKE :booking
				""")
				.param("listener", LISTENER_ID).param("booking", "%\"value\":" + bookingId + "%")
				.query(Long.class).single();
	}

	/**
	 * AC-1 — the money path is not behind the mail queue. Ten confirmations are dispatched into an
	 * unresponsive transport (more than the shared executor's eight core threads, so before the fix the
	 * pool is exhausted, not merely busy); an eleventh booking is then confirmed through the payment
	 * route, and both invariant-#8 confirmation and invariant-#9 accrual must land while mail is still
	 * hanging.
	 */
	@Test
	void wedgedMailDoesNotDelayTheMoneyPath() {
		SetRef set = onlineSet();
		transport.block();

		LocalDate wedgeDate = LocalDate.of(2031, 3, 1);
		for (int i = 0; i < WEDGED_SENDS; i++) {
			long id = seedBooking(set, "WEDGE%03d".formatted(i), wedgeDate.plusDays(i),
					"wedge-%d@example.com".formatted(i), 1500L, "CONFIRMED");
			publishInTransaction(confirmationOf(set, id, wedgeDate.plusDays(i), 1500L));
		}
		Awaitility.await("mail sends are in flight").atMost(WAIT)
				.until(() -> transport.attemptsMatching("wedge-") >= 2);

		LocalDate payDate = LocalDate.of(2031, 4, 2);
		long paidBooking = seedBooking(set, "BULKHED1", payDate, "bulkhead-payer@example.com", 5500L,
				"AWAITING_PAYMENT");
		publishInTransaction(new PaymentConfirmed(new BookingRef(paidBooking), "pi_bulkhead_test"));

		Awaitility.await("payment -> booking confirmation (invariant #8)").atMost(WAIT)
				.until(() -> "CONFIRMED".equals(statusOf(paidBooking)));
		Awaitility.await("booking -> payout accrual (invariant #9)").atMost(WAIT)
				.until(() -> accrualsFor(paidBooking) == 1L);

		assertThat(transport.deliveriesMatching("wedge-"))
				.as("the mail transport is still hanging — the money path overtook it, not the reverse")
				.isZero();
	}

	/**
	 * AC-3 — a failed send stays outstanding and is re-delivered on resubmit, which is exactly what
	 * {@code republish-outstanding-events-on-restart} performs at boot. The resubmit predicate is
	 * narrowed to this booking on purpose: the container is shared with other IT classes, and a blanket
	 * resubmit would re-deliver their events too.
	 */
	@Test
	void aFailedSendLeavesThePublicationOutstandingAndIsRetried() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2031, 5, 3);
		String contact = "retry-me@example.com";
		long bookingId = seedBooking(set, "RETRYME1", date, contact, 2600L, "CONFIRMED");

		transport.failEverySend(true);
		publishInTransaction(confirmationOf(set, bookingId, date, 2600L));

		Awaitility.await("the failing send was attempted").atMost(WAIT)
				.until(() -> transport.attemptsMatching(contact) >= 1);
		Awaitility.await("the publication is still outstanding, so a restart would retry it").atMost(WAIT)
				.until(() -> outstandingMailPublications(bookingId) == 1L);

		transport.failEverySend(false);
		incompletePublications.resubmitIncompletePublications(publication ->
				publication.getEvent() instanceof BookingConfirmed confirmed
						&& confirmed.bookingId().value() == bookingId);

		Awaitility.await("the retry delivered").atMost(WAIT)
				.until(() -> transport.deliveriesMatching(contact) == 1L);
		Awaitility.await("and the publication is now complete").atMost(WAIT)
				.until(() -> outstandingMailPublications(bookingId) == 0L);
	}

	/**
	 * AC-5 — the {@code listener_id} the registry writes is still the string V31 (#382) migrated every
	 * pre-existing row to. Asserted against an <em>outstanding</em> row, which is the one republication
	 * actually matches on.
	 */
	@Test
	void keepsTheListenerIdV31Migrated() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2031, 6, 4);
		long bookingId = seedBooking(set, "LSTNRID1", date, "listener-id@example.com", 2700L, "CONFIRMED");

		transport.failEverySend(true);
		publishInTransaction(confirmationOf(set, bookingId, date, 2700L));

		Awaitility.await("an outstanding row exists under the migrated listener id").atMost(WAIT)
				.until(() -> outstandingMailPublications(bookingId) == 1L);

		List<String> ids = jdbc.sql("SELECT listener_id FROM event_publication "
						+ "WHERE completion_date IS NULL AND serialized_event LIKE :booking")
				.param("booking", "%\"value\":" + bookingId + "%")
				.query(String.class).list();
		assertThat(ids)
				.as("republication matches listener_id string-equal; drift dead-letters every outstanding row")
				.contains(LISTENER_ID);
	}

	/**
	 * AC-7 — no transaction (and so no Hikari connection) is held around the transport call. The
	 * listener's three port reads are independent read-only queries with nothing to keep consistent
	 * between them, so the transaction {@code @ApplicationModuleListener} supplied bought only the risk
	 * #383 names: a connection pinned for the length of an SMTP round-trip.
	 */
	@Test
	void sendsWithNoTransactionHeldOpen() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2031, 7, 5);
		String contact = "no-tx@example.com";
		long bookingId = seedBooking(set, "NOTXHELD", date, contact, 2800L, "CONFIRMED");

		publishInTransaction(confirmationOf(set, bookingId, date, 2800L));

		Awaitility.await("delivered").atMost(WAIT).until(() -> transport.deliveriesMatching(contact) == 1L);
		assertThat(transport.transactionActive())
				.as("the SMTP round-trip must not pin a pooled connection")
				.containsOnly(false);
	}
}
