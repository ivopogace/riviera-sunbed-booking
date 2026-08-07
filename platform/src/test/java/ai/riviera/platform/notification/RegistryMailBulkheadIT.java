package ai.riviera.platform.notification;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.notification.BookingMailFixtures.SetRef;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The bulkhead between transactional mail and the money path — the mail twin of
 * {@code RefundBulkheadIT}. Rationale: RESPONSIBILITIES.md §`notification`.
 *
 * <p>A registry mail listener on Boot's shared {@code applicationTaskExecutor} would put an SMTP
 * round-trip on the pool that also carries {@code booking}'s {@code PaymentEventListener}
 * (invariant #8) and {@code payout}'s accrual listener (invariant #9). These tests hold the fix in
 * place from four angles:
 *
 * <ul>
 *   <li>with every mail thread wedged on an unresponsive transport, a payment still confirms its
 *       booking and still accrues its payout;</li>
 *   <li>a failed send still leaves the publication <em>outstanding</em> and a resubmit still
 *       re-delivers it — losing this silently would turn at-least-once into fire-and-forget;</li>
 *   <li>the registry's {@code listener_id} still reads as the migration wrote it. The id embeds the
 *       listener FQCN and signature, and republication matches it string-equal, so drift here
 *       dead-letters every outstanding row;</li>
 *   <li>the send holds no transaction <em>and</em> no bound pooled connection for the duration of the
 *       round-trip. The two are asserted separately on purpose: the connection does not follow from
 *       the transaction, and it is the scarcer resource.</li>
 * </ul>
 *
 * <p>What a <em>shed</em> send costs is not asked here: this class wedges the transport, it never
 * overflows the queue. {@code RegistryMailShedDurabilityIT} owns that, in its own context, for the
 * isolation reason below.
 *
 * <p>The imported {@link ControllableMailerConfiguration} gives this class its <strong>own</strong>
 * Spring context rather than the suite's shared one — deliberate: a test that deliberately wedges a
 * thread pool must not hand that pool to the next class in the run. The gate is released
 * unconditionally in {@link #releaseTransport()}. Bookings are SQL-seeded on dates no other IT uses
 * via {@link BookingMailFixtures}, and never claimed through {@code availability}.
 * Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, ControllableMailerConfiguration.class })
@SpringBootTest
class RegistryMailBulkheadIT {

	private static final Duration WAIT = Duration.ofSeconds(20);

	/**
	 * More wedged sends than Boot's stock {@code applicationTaskExecutor} core pool (8), so that before
	 * the fix the shared pool is genuinely exhausted rather than merely busy — that is what makes the
	 * money-path assertion below fail loudly instead of flaking.
	 */
	private static final int WEDGED_SENDS = 10;

	/** Improbable enough to identify one test's publication in a database several IT classes write to. */
	private static final long RETRY_AMOUNT_MINOR = 383_000_601L;

	private static final long LISTENER_ID_AMOUNT_MINOR = 383_000_602L;

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

	private BookingMailFixtures fixtures;

	@BeforeEach
	void resetTransport() {
		fixtures = new BookingMailFixtures(jdbc, txManager, publisher);
		transport.reset();
	}

	@AfterEach
	void releaseTransport() {
		transport.release();
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

	/**
	 * AC-1 — the money path is not behind the mail queue. Ten confirmations are dispatched into an
	 * unresponsive transport (more than the shared executor's eight core threads, so before the fix the
	 * pool is exhausted, not merely busy); an eleventh booking is then confirmed through the payment
	 * route, and both invariant-#8 confirmation and invariant-#9 accrual must land while mail is still
	 * hanging.
	 */
	@Test
	void wedgedMailDoesNotDelayTheMoneyPath() {
		SetRef set = fixtures.onlineSet();
		transport.block();

		LocalDate wedgeDate = LocalDate.of(2031, 3, 1);
		for (int i = 0; i < WEDGED_SENDS; i++) {
			long id = fixtures.seedBooking(set, "WEDGE%03d".formatted(i), wedgeDate.plusDays(i),
					"wedge-%d@example.com".formatted(i), 1500L, "CONFIRMED");
			fixtures.publishInTransaction(fixtures.confirmationOf(set, id, wedgeDate.plusDays(i), 1500L));
		}
		Awaitility.await("mail sends are in flight").atMost(WAIT)
				.until(() -> transport.attemptsMatching("wedge-") >= 2);

		LocalDate payDate = LocalDate.of(2031, 4, 2);
		long paidBooking = fixtures.seedBooking(set, "BULKHED1", payDate, "bulkhead-payer@example.com", 5500L,
				"AWAITING_PAYMENT");
		fixtures.publishInTransaction(new PaymentConfirmed(new BookingRef(paidBooking), "pi_bulkhead_test"));

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
	 * narrowed to this booking on purpose: the database is shared with other IT classes in this
	 * context, and a blanket resubmit would re-deliver their events too.
	 */
	@Test
	void aFailedSendLeavesThePublicationOutstandingAndIsRetried() {
		SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2031, 5, 3);
		String contact = "retry-me@example.com";
		long bookingId = fixtures.seedBooking(set, "RETRYME1", date, contact, RETRY_AMOUNT_MINOR, "CONFIRMED");

		transport.failEverySend(true);
		fixtures.publishInTransaction(fixtures.confirmationOf(set, bookingId, date, RETRY_AMOUNT_MINOR));

		Awaitility.await("the failing send was attempted").atMost(WAIT)
				.until(() -> transport.attemptsMatching(contact) >= 1);
		Awaitility.await("the publication is still outstanding, so a restart would retry it").atMost(WAIT)
				.until(() -> fixtures.outstandingMailPublications(RETRY_AMOUNT_MINOR) == 1L);

		transport.failEverySend(false);
		incompletePublications.resubmitIncompletePublications(publication ->
				publication.getEvent() instanceof BookingConfirmed confirmed
						&& confirmed.bookingId().value() == bookingId);

		Awaitility.await("the retry delivered").atMost(WAIT)
				.until(() -> transport.deliveriesMatching(contact) == 1L);
		Awaitility.await("and the publication is now complete").atMost(WAIT)
				.until(() -> fixtures.outstandingMailPublications(RETRY_AMOUNT_MINOR) == 0L);
	}

	/**
	 * AC-5 — the {@code listener_id} the registry writes is still the string V31 (#382) migrated every
	 * pre-existing row to. Asserted against an <em>outstanding</em> row, which is the one republication
	 * actually matches on.
	 */
	@Test
	void keepsTheListenerIdV31Migrated() {
		SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2031, 6, 4);
		long bookingId = fixtures.seedBooking(set, "LSTNRID1", date, "listener-id@example.com",
				LISTENER_ID_AMOUNT_MINOR, "CONFIRMED");

		transport.failEverySend(true);
		fixtures.publishInTransaction(fixtures.confirmationOf(set, bookingId, date, LISTENER_ID_AMOUNT_MINOR));

		Awaitility.await("an outstanding row exists under the migrated listener id").atMost(WAIT)
				.until(() -> fixtures.outstandingMailPublications(LISTENER_ID_AMOUNT_MINOR) == 1L);

		List<String> ids = fixtures.outstandingListenerIds(LISTENER_ID_AMOUNT_MINOR);
		assertThat(ids)
				.as("republication matches listener_id string-equal; drift dead-letters every outstanding row")
				.contains(BookingMailFixtures.LISTENER_ID);
	}

	/**
	 * AC-7 — no transaction, and no bound Hikari connection, around the transport call. The listener's
	 * three port reads are independent read-only queries with nothing to keep consistent between them,
	 * so the transaction {@code @ApplicationModuleListener} supplied bought only the risk #383 names: a
	 * connection pinned for the length of an SMTP round-trip.
	 *
	 * <p>Both flags are asserted, and the second is the load-bearing one — see
	 * {@link ControllableMailer} for why {@code NOT_SUPPORTED} satisfies the first while still pinning
	 * the connection. Each sample list must be non-empty: a send that never ran would otherwise clear
	 * both assertions by having nothing to contradict them, which is how a bulkhead test ships vacuous.
	 */
	@Test
	void sendsWithNoTransactionHeldOpen() {
		SetRef set = fixtures.onlineSet();
		LocalDate date = LocalDate.of(2031, 7, 5);
		String contact = "no-tx@example.com";
		long bookingId = fixtures.seedBooking(set, "NOTXHELD", date, contact, 2800L, "CONFIRMED");

		fixtures.publishInTransaction(fixtures.confirmationOf(set, bookingId, date, 2800L));

		Awaitility.await("delivered").atMost(WAIT).until(() -> transport.deliveriesMatching(contact) == 1L);
		assertThat(transport.transactionActive())
				.as("the SMTP round-trip must not run inside a transaction")
				.isNotEmpty()
				.containsOnly(false);
		assertThat(transport.connectionBound())
				.as("the SMTP round-trip must not pin a pooled connection")
				.isNotEmpty()
				.containsOnly(false);
	}
}
