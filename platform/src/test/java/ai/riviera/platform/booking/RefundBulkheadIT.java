package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.CopyOnWriteArrayList;

import javax.sql.DataSource;

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
import ai.riviera.platform.booking.adapter.in.BookingListenerIds;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.RefundResult;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The bulkhead between the cancellation refund and the money path (#404).
 *
 * <p>{@code @ApplicationModuleListener} expands to a bare {@code @Async}, which is Boot's shared
 * {@code applicationTaskExecutor} — the pool that also carries {@code booking}'s
 * {@code PaymentEventListener} (invariant #8) and {@code payout}'s accrual listener (invariant #9) on
 * eight core threads behind an unbounded queue. {@link ai.riviera.platform.booking.adapter.in.BookingRefundListener}
 * drives {@code payment}'s {@link RefundPort}, i.e. a blocking gateway round-trip, so a degraded gateway
 * could occupy that spine. #383 fixed the identical hazard for mail and named this listener as the
 * sibling it deferred; these tests hold the fix in place from four angles:
 *
 * <ul>
 *   <li><strong>AC-2</strong> — with every refund thread wedged on an unresponsive gateway, a payment
 *       still confirms its booking and still accrues its payout.</li>
 *   <li><strong>AC-3</strong> — the refund holds no transaction <em>and</em> no bound pooled connection
 *       across the gateway call. The two are asserted separately on purpose: the connection does not
 *       follow from the transaction, and it is the scarcer resource — ten of them, shared with every
 *       HTTP request thread.</li>
 *   <li><strong>AC-4</strong> — the decomposition into explicit annotations did not cost the Event
 *       Publication Registry its grip: a failed refund still leaves the publication <em>outstanding</em>
 *       and a resubmit still re-delivers it. This is the whole retry story for a refund, so losing it
 *       silently would turn "money owed is never lost" into fire-and-forget.</li>
 *   <li><strong>AC-5</strong> — the {@code listener_id} still reads exactly as it did before the swap.
 *       The id embeds the listener FQCN and signature and republication matches it string-equal, so
 *       drift would dead-letter every outstanding refund — and would owe a Flyway rewrite this slice
 *       claims not to need.</li>
 * </ul>
 *
 * <p>What a <em>shed</em> refund costs is the sibling question and is not asked here: these tests wedge
 * the gateway, they never overflow the queue (the shipped capacity is 500). The shed contract is
 * {@code RefundExecutorConfigTest}'s, at the unit level where saturation is reachable deterministically.
 *
 * <p>The nested {@link ControllableRefundConfiguration} gives this class its <strong>own</strong> Spring
 * context rather than the suite's shared one — deliberate: a test that wedges a thread pool must not
 * hand that pool to the next class in the run. The gate is released unconditionally in
 * {@link #releaseGateway()}. Bookings are SQL-seeded on dates no other IT uses, and never claimed
 * through {@code availability}. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, RefundBulkheadIT.ControllableRefundConfiguration.class })
@SpringBootTest
class RefundBulkheadIT {

	private static final Duration WAIT = Duration.ofSeconds(20);

	/**
	 * More wedged refunds than Boot's stock {@code applicationTaskExecutor} core pool (8), so that
	 * before the fix the shared pool is genuinely exhausted rather than merely busy — that is what makes
	 * the money-path assertion below fail loudly instead of flaking.
	 */
	private static final int WEDGED_REFUNDS = 10;

	/**
	 * The registry's id for the refund listener, class-derived so a rename breaks the compile rather
	 * than this pin. {@link #keepsTheListenerIdUnchanged} proves the running registry writes it (a move
	 * would owe a Flyway {@code listener_id} rewrite, invariant #12) — and since #454 that same check is
	 * level 2 of the admin lever's scope pinning, {@code RefundOutboxScopeTest} being level 1.
	 */
	private static final String REFUND_LISTENER_ID = BookingListenerIds.REFUND;

	/** Improbable enough to identify one test's publication in a database several IT classes write to. */
	private static final long RETRY_REFUND_MINOR = 404_000_601L;

	private static final long LISTENER_ID_REFUND_MINOR = 404_000_602L;

	@Autowired
	ControllableRefundPort gateway;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	IncompleteEventPublications incompletePublications;

	private TransactionTemplate transactions;

	@BeforeEach
	void resetGateway() {
		transactions = new TransactionTemplate(txManager);
		gateway.reset();
	}

	@AfterEach
	void releaseGateway() {
		gateway.release();
	}

	// ---- fixtures ----------------------------------------------------------------------------

	private record SetRef(long setId, long venueId) { }

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long seedBooking(SetRef set, String code, LocalDate date, String contactEmail,
			long amountMinor, String status) {
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Refund Bulkhead Guest', '+355782') RETURNING id")
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
		transactions.executeWithoutResult(status -> publisher.publishEvent(event));
	}

	private BookingCancelled cancellationOf(SetRef set, long bookingId, LocalDate date, long refundMinor) {
		return new BookingCancelled(new BookingId(bookingId), new VenueId(set.venueId()),
				new SetId(set.setId()), date, refundMinor, "EUR", RefundReason.POLICY);
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

	private long outstandingRefundPublications(long refundMinor) {
		return jdbc.sql("""
				SELECT COUNT(*) FROM event_publication
				WHERE completion_date IS NULL AND listener_id = :listener
				  AND serialized_event LIKE :amountFragment
				""")
				.param("listener", REFUND_LISTENER_ID)
				.param("amountFragment", "%" + refundMinor + "%")
				.query(Long.class).single();
	}

	private List<String> outstandingListenerIds(long refundMinor) {
		return jdbc.sql("SELECT listener_id FROM event_publication "
						+ "WHERE completion_date IS NULL AND serialized_event LIKE :amountFragment")
				.param("amountFragment", "%" + refundMinor + "%")
				.query(String.class).list();
	}

	// ---- the acceptance criteria -------------------------------------------------------------

	/**
	 * AC-2 — the money path is not behind the refund queue. Ten cancellations are dispatched into an
	 * unresponsive gateway (more than the shared executor's eight core threads, so before the fix the
	 * pool is exhausted, not merely busy); an eleventh booking is then confirmed through the payment
	 * route, and both invariant-#8 confirmation and invariant-#9 accrual must land while every refund is
	 * still hanging.
	 */
	@Test
	void wedgedRefundDoesNotDelayTheMoneyPath() {
		SetRef set = onlineSet();
		gateway.block();

		LocalDate wedgeDate = LocalDate.of(2032, 3, 1);
		List<Long> wedged = new ArrayList<>();
		for (int i = 0; i < WEDGED_REFUNDS; i++) {
			long id = seedBooking(set, "RFWEDG%02d".formatted(i), wedgeDate.plusDays(i),
					"refund-wedge-%d@example.com".formatted(i), 1500L, "CANCELLED");
			wedged.add(id);
			publishInTransaction(cancellationOf(set, id, wedgeDate.plusDays(i), 1500L));
		}
		Awaitility.await("refunds are in flight").atMost(WAIT)
				.until(() -> wedged.stream().mapToLong(gateway::attemptsFor).sum() >= 2);

		LocalDate payDate = LocalDate.of(2032, 4, 2);
		long paidBooking = seedBooking(set, "RFBULKH1", payDate, "refund-bulkhead-payer@example.com",
				5500L, "AWAITING_PAYMENT");
		publishInTransaction(new PaymentConfirmed(new BookingRef(paidBooking), "pi_refund_bulkhead_test"));

		Awaitility.await("payment -> booking confirmation (invariant #8)").atMost(WAIT)
				.until(() -> "CONFIRMED".equals(statusOf(paidBooking)));
		Awaitility.await("booking -> payout accrual (invariant #9)").atMost(WAIT)
				.until(() -> accrualsFor(paidBooking) == 1L);

		assertThat(wedged.stream().mapToLong(gateway::completionsFor).sum())
				.as("the gateway is still hanging — the money path overtook it, not the reverse")
				.isZero();
	}

	/**
	 * AC-3 — no transaction, and no bound Hikari connection, around the gateway call.
	 *
	 * <p>Both flags are asserted, and the second is the load-bearing one. {@code REQUIRES_NEW} bought
	 * nothing the listener needed — its only write, {@code markRefunded}, is a single statement that runs
	 * after a successful refund — while pinning one of ten pooled connections for the length of the
	 * round-trip, on a pool shared with every HTTP request thread. Dropping {@code @Transactional} is
	 * what releases it; note that a mere {@code NOT_SUPPORTED} would satisfy the first assertion and
	 * still fail the second, which is why the second exists.
	 *
	 * <p>Each sample list must be non-empty: a refund that never ran would otherwise clear both
	 * assertions by having nothing to contradict them, which is how a bulkhead test ships vacuous.
	 */
	@Test
	void refundsWithNoTransactionOrConnectionHeldOpen() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2032, 7, 5);
		long bookingId = seedBooking(set, "RFNOTXH1", date, "refund-no-tx@example.com", 2800L, "CANCELLED");

		publishInTransaction(cancellationOf(set, bookingId, date, 2800L));

		Awaitility.await("refunded").atMost(WAIT).until(() -> gateway.completionsFor(bookingId) == 1L);
		assertThat(gateway.transactionFlagsFor(bookingId))
				.as("the gateway round-trip must not run inside a transaction")
				.isNotEmpty()
				.containsOnly(false);
		assertThat(gateway.connectionFlagsFor(bookingId))
				.as("the gateway round-trip must not pin a pooled connection — ten of them are shared "
						+ "with every request thread, so this is the scarcer resource of the two")
				.isNotEmpty()
				.containsOnly(false);
	}

	/**
	 * AC-4 — a failed refund stays outstanding and is re-delivered on resubmit, which is exactly what
	 * {@code republish-outstanding-events-on-restart} performs at boot. This is the entire automatic
	 * retry story for money owed under invariant #10, so it is asserted against a real registry rather
	 * than inferred from the listener throwing.
	 *
	 * <p>The resubmit predicate is narrowed to this booking on purpose: the database is shared with
	 * other IT classes in this context, and a blanket resubmit would re-deliver their events too.
	 */
	@Test
	void aFailedRefundLeavesThePublicationOutstandingAndIsRetried() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2032, 5, 3);
		long bookingId = seedBooking(set, "RFRETRY1", date, "refund-retry-me@example.com",
				RETRY_REFUND_MINOR, "CANCELLED");

		gateway.failEveryRefund(true);
		publishInTransaction(cancellationOf(set, bookingId, date, RETRY_REFUND_MINOR));

		Awaitility.await("the failing refund was attempted").atMost(WAIT)
				.until(() -> gateway.attemptsFor(bookingId) >= 1);
		Awaitility.await("the publication is still outstanding, so a restart would retry it").atMost(WAIT)
				.until(() -> outstandingRefundPublications(RETRY_REFUND_MINOR) == 1L);

		gateway.failEveryRefund(false);
		incompletePublications.resubmitIncompletePublications(publication ->
				publication.getEvent() instanceof BookingCancelled cancelled
						&& cancelled.bookingId().value() == bookingId);

		Awaitility.await("the retry issued the refund").atMost(WAIT)
				.until(() -> gateway.completionsFor(bookingId) >= 1L);
		Awaitility.await("and the publication is now complete").atMost(WAIT)
				.until(() -> outstandingRefundPublications(RETRY_REFUND_MINOR) == 0L);
	}

	/**
	 * AC-5 — the {@code listener_id} the registry writes still reads exactly as it did before the
	 * annotations were swapped. Asserted against an <em>outstanding</em> row, which is the one
	 * republication actually matches on.
	 */
	@Test
	void keepsTheListenerIdUnchanged() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2032, 6, 4);
		long bookingId = seedBooking(set, "RFLSTNR1", date, "refund-listener-id@example.com",
				LISTENER_ID_REFUND_MINOR, "CANCELLED");

		gateway.failEveryRefund(true);
		publishInTransaction(cancellationOf(set, bookingId, date, LISTENER_ID_REFUND_MINOR));

		Awaitility.await("an outstanding row exists under the refund listener id").atMost(WAIT)
				.until(() -> outstandingRefundPublications(LISTENER_ID_REFUND_MINOR) == 1L);

		assertThat(outstandingListenerIds(LISTENER_ID_REFUND_MINOR))
				.as("republication matches listener_id string-equal; drift dead-letters every outstanding "
						+ "refund and would owe the Flyway rewrite this slice claims not to need")
				.contains(REFUND_LISTENER_ID);
	}

	// ---- the controllable gateway ------------------------------------------------------------

	@TestConfiguration
	static class ControllableRefundConfiguration {

		@Bean
		@Primary
		ControllableRefundPort controllableRefundPort(DataSource dataSource) {
			return new ControllableRefundPort(dataSource);
		}
	}

	/**
	 * A {@link RefundPort} that can be made unresponsive or made to fail, and that records what the
	 * calling thread was holding while it ran.
	 *
	 * <p>It doubles for the real gateway at the seam {@code booking} actually depends on —
	 * {@code payment::api} — rather than at {@code payment}'s internal {@code PaymentGateway}, which is
	 * module-private and which a {@code booking} test has no business reaching into (invariant #11).
	 *
	 * <p><strong>Why it records the connection and not just the transaction.</strong>
	 * {@code isActualTransactionActive()} goes false under {@code @Transactional(NOT_SUPPORTED)} while
	 * {@code DataSourceUtils} keeps the {@code ConnectionHolder} bound for the whole method — so a
	 * transaction assertion alone can read green with the pooled connection still pinned across the
	 * round-trip, which is the resource #404 is actually about.
	 */
	static final class ControllableRefundPort implements RefundPort {

		private static final long BLOCK_TIMEOUT_SECONDS = 30;

		/**
		 * One refund the port was asked for, with what the calling thread was holding at the time.
		 *
		 * <p><strong>Every reading is keyed by booking id, and that is not decoration.</strong> A test
		 * that wedges the pool leaves refunds still draining when the next test's {@code reset()} runs,
		 * so their completions land <em>after</em> the counters are cleared. Global counters therefore
		 * make an exact assertion ({@code completions() == 1}) unsatisfiable at random, and — worse —
		 * would let one test's transaction/connection samples answer another test's assertion. Scoping
		 * to the booking under test removes the coupling instead of papering over it with a sleep.
		 */
		private record Attempt(long bookingId, boolean transactionActive, boolean connectionBound,
				boolean completed) { }

		private final DataSource dataSource;

		private final List<Attempt> attempts = new CopyOnWriteArrayList<>();
		private final AtomicBoolean failing = new AtomicBoolean();

		private volatile CountDownLatch gate = new CountDownLatch(0);

		ControllableRefundPort(DataSource dataSource) {
			this.dataSource = dataSource;
		}

		@Override
		public RefundResult refund(BookingRef booking, Money amount) {
			long bookingId = booking.value();
			boolean inTransaction = TransactionSynchronizationManager.isActualTransactionActive();
			boolean connectionHeld = TransactionSynchronizationManager.hasResource(dataSource);
			// Recorded before the gate so a wedged refund is observable while it is still hanging.
			attempts.add(new Attempt(bookingId, inTransaction, connectionHeld, false));
			awaitGate();
			if (failing.get()) {
				return new RefundResult.Failed("controlled_failure");
			}
			attempts.add(new Attempt(bookingId, inTransaction, connectionHeld, true));
			return new RefundResult.Refunded("re_test_" + bookingId);
		}

		private void awaitGate() {
			try {
				gate.await(BLOCK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
		}

		/** Make every refund hang until {@link #release()} — the degraded-gateway simulation. */
		void block() {
			gate = new CountDownLatch(1);
		}

		void release() {
			gate.countDown();
		}

		void failEveryRefund(boolean fail) {
			failing.set(fail);
		}

		void reset() {
			release();
			gate = new CountDownLatch(0);
			failing.set(false);
			attempts.clear();
		}

		long attemptsFor(long bookingId) {
			return attempts.stream().filter(a -> a.bookingId() == bookingId && !a.completed()).count();
		}

		long completionsFor(long bookingId) {
			return attempts.stream().filter(a -> a.bookingId() == bookingId && a.completed()).count();
		}

		List<Boolean> transactionFlagsFor(long bookingId) {
			return attempts.stream().filter(a -> a.bookingId() == bookingId)
					.map(Attempt::transactionActive).toList();
		}

		List<Boolean> connectionFlagsFor(long bookingId) {
			return attempts.stream().filter(a -> a.bookingId() == bookingId)
					.map(Attempt::connectionBound).toList();
		}
	}
}
