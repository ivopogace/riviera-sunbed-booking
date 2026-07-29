package ai.riviera.platform.notification;

import java.net.URI;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import javax.sql.DataSource;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.micrometer.core.instrument.MeterRegistry;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.ConfirmationMailExecutorConfig;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The registry vehicle's bulkhead (#383): a degraded relay must be unable to consume resources the
 * money-path spine needs — neither one of Boot's eight shared executor threads nor one of Hikari's
 * stock ten connections.
 *
 * <ul>
 *   <li><strong>AC-1:</strong> with every mail thread and the queue slot wedged, {@code PaymentConfirmed}
 *       still confirms its booking and {@code BookingConfirmed} still accrues exactly one payout entry.</li>
 *   <li><strong>AC-2:</strong> the transport runs in no transaction and holds no pooled connection.</li>
 *   <li><strong>AC-3:</strong> a saturated pool sheds the send, counts it, and leaves the publication
 *       outstanding — never silently completed.</li>
 *   <li><strong>AC-5:</strong> decomposing {@code @ApplicationModuleListener} kept the registry's
 *       {@code listener_id}, so no publication is orphaned (the V18 / V31 lesson).</li>
 *   <li><strong>AC-6:</strong> the listener runs on its own pool, not {@code applicationTaskExecutor}.</li>
 * </ul>
 *
 * <p>Sends are parked on a latch this class controls, never on a timeout: the configured SMTP timeouts
 * are per socket operation rather than a session ceiling, so a duration-based test would be both slow
 * and wrong. The queue is configured down to one slot so saturation costs three events, not a hundred —
 * the reason those two knobs are properties rather than constants.
 *
 * <p>Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, ConfirmationMailBulkheadIT.ProbeMailerConfiguration.class })
@SpringBootTest
@TestPropertySource(properties = {
		"riviera.notification.confirmation-mail.pool-size=2",
		"riviera.notification.confirmation-mail.queue-capacity=1" })
class ConfirmationMailBulkheadIT {

	private static final Duration WAIT = Duration.ofSeconds(15);
	private static final long AMOUNT_MINOR = 4200L;
	private static final AtomicInteger SEQ = new AtomicInteger();
	private static final int POOL_SIZE = 2;
	private static final int QUEUE_CAPACITY = 1;

	/**
	 * A date no other IT books. Classes sharing this context key share one container, and a claimed
	 * {@code (set, date)} is never released (invariant #2).
	 */
	private static final LocalDate BOOKING_DATE = LocalDate.of(2031, 3, 17);

	private static final String BOOKING_CONFIRMED = "ai.riviera.platform.booking.events.BookingConfirmed";

	/** Frozen: the registry stores this string, so the class, package and signature cannot move. */
	private static final String EXPECTED_LISTENER_ID =
			"ai.riviera.platform.notification.adapter.in.BookingConfirmationMailListener"
					+ ".on(ai.riviera.platform.booking.events.BookingConfirmed)";

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ProbeMailer probe;

	@Autowired
	MeterRegistry meters;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	IncompleteEventPublications incompletePublications;

	@Autowired
	ApplicationContext context;

	@BeforeEach
	void rearmProbe() {
		probe.reset();
	}

	@AfterEach
	void unblockPool() {
		probe.releaseSends();
	}

	/**
	 * AC-2 — the transport must not run inside a transaction. The listener writes nothing, so the
	 * transaction bought only a Hikari connection held across a third-party network call.
	 */
	@Test
	void theSendHoldsNoTransactionAndNoConnection() throws Exception {
		publishConfirmedBooking();

		assertThat(probe.awaitSend(WAIT)).as("the confirmation mail never reached the transport").isTrue();
		assertThat(probe.transactionActive())
				.as("the SMTP call must not run inside a transaction").isFalse();
		assertThat(probe.connectionBound())
				.as("the SMTP call must hold no pooled connection").isFalse();
	}

	/**
	 * AC-5 — the registry keys a publication on the listener's FQ method signature, so decomposing
	 * {@code @ApplicationModuleListener} into its parts must not move it: a changed id orphans every
	 * outstanding row, which is what V18 and V31 had to repair.
	 */
	@Test
	void decompositionKeepsTheRegistryListenerId() throws Exception {
		publishConfirmedBooking();
		assertThat(probe.awaitSend(WAIT)).as("the confirmation mail never reached the transport").isTrue();

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertThat(listenerIdsFor(BOOKING_CONFIRMED))
				.as("the registry must still track this listener under its pre-decomposition id")
				.contains(EXPECTED_LISTENER_ID));
	}

	/** AC-1 — the money path must be indifferent to a wedged relay. */
	@Test
	void aBlockedRelayDoesNotDelayTheMoneyPath() throws Exception {
		probe.blockSends();
		saturateMailPool();

		long bookingId = seed("AWAITING_PAYMENT").id();
		publishInTransaction(new PaymentConfirmed(new BookingRef(bookingId), "pi_bulkhead_test"));

		Awaitility.await().atMost(WAIT).untilAsserted(() -> {
			assertThat(statusOf(bookingId))
					.as("payment -> booking confirmation must not queue behind mail").isEqualTo("CONFIRMED");
			assertThat(accrualsFor(bookingId))
					.as("booking -> payout accrual must not queue behind mail (invariant #9)").isEqualTo(1L);
		});
	}

	/**
	 * AC-3 — saturation sheds the send and leaves the registry still owing it. Marking it completed
	 * would convert at-least-once into a silent loss; throwing would put the failure on the committing
	 * thread. The counter is asserted because it, not the log line, is the operational signal.
	 */
	@Test
	void saturationShedsTheSendAndLeavesThePublicationOutstanding() throws Exception {
		probe.blockSends();
		saturateMailPool();
		double shedBefore = shedCount();

		SeededBooking shed = seed("CONFIRMED");
		publishInTransaction(confirmedEvent(shed));

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertThat(shedCount())
				.as("a rejected send must be counted, not silently dropped").isGreaterThan(shedBefore));
		assertThat(outstandingFor(shed.id()))
				.as("a shed send must leave its publication outstanding, never completed").isEqualTo(1L);
	}

	/**
	 * Declaring the mail pool must not cost the spine its own executor. Boot gates the whole of
	 * {@code TaskExecutorConfiguration} — which declares {@code applicationTaskExecutor} — behind
	 * {@code OnExecutorCondition}, an {@code AnyNestedCondition} whose first branch is
	 * {@code @ConditionalOnMissingBean(Executor.class)}. So an unguarded second `Executor` bean makes
	 * Boot skip it entirely and every unqualified {@code @Async} — all four money-path listeners —
	 * silently falls back to an unbounded executor. The bulkhead would then have removed a bound from
	 * the very path it exists to protect, and no other test would notice: unbounded threads always keep
	 * up, so AC-1 still passes.
	 */
	@Test
	void declaringTheMailPoolLeavesBootsSharedExecutorInPlace() {
		assertThat(context.containsBean("applicationTaskExecutor"))
				.as("the spine's own executor must still exist alongside the mail pool").isTrue();
		assertThat(context.getBean("applicationTaskExecutor"))
				.as("the spine must still be on Boot's BOUNDED pool, not an unbounded fallback")
				.isInstanceOf(ThreadPoolTaskExecutor.class);
	}

	/** AC-6 — the listener runs on its own pool, never Boot's shared applicationTaskExecutor. */
	@Test
	void theListenerRunsOnItsOwnPool() throws Exception {
		publishConfirmedBooking();

		assertThat(probe.awaitSend(WAIT)).as("the confirmation mail never reached the transport").isTrue();
		assertThat(probe.sendThreadName())
				.as("registry-borne mail must not share the money path's executor")
				.startsWith(ConfirmationMailExecutorConfig.THREAD_NAME_PREFIX)
				.doesNotStartWith("task-");
	}

	/**
	 * AC-4 — registry durability after the decomposition, on the side the existing suite never covered.
	 * {@code BookingConfirmationMailIT} proves a <em>completed</em> publication is not redelivered; this
	 * proves the other half, which is the entire reason #383 could not be folded into #371: a listener
	 * that threw must leave its publication outstanding, and resubmission — what
	 * {@code republish-outstanding-events-on-restart} does at boot — must deliver it. Silently losing
	 * that would turn at-least-once into fire-and-forget with no failing test.
	 *
	 * <p>The failure is injected through the probe rather than the recording {@code MockMailer}: a
	 * fail-on-demand hook on the production mock would be test-only machinery in shipped code.
	 */
	@Test
	void aFailedSendStaysOutstandingAndIsRedeliveredOnResubmission() {
		SeededBooking succeeded = seed("CONFIRMED");
		publishInTransaction(confirmedEvent(succeeded));
		Awaitility.await().atMost(WAIT).until(() -> probe.deliveriesOf(codeOf(succeeded)) == 1L);

		probe.failSends();
		SeededBooking failed = seed("CONFIRMED");
		publishInTransaction(confirmedEvent(failed));
		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertThat(outstandingFor(failed.id()))
				.as("a transport failure must leave the publication outstanding").isEqualTo(1L));

		probe.deliverSends();
		incompletePublications.resubmitIncompletePublications(publication -> true);

		Awaitility.await().atMost(WAIT).untilAsserted(() -> {
			assertThat(probe.deliveriesOf(codeOf(failed)))
					.as("resubmission must redeliver the failed send").isEqualTo(1L);
			assertThat(outstandingFor(failed.id()))
					.as("a redelivered publication must then complete").isZero();
		});
		assertThat(probe.deliveriesOf(codeOf(succeeded)))
				.as("resubmission must NOT redeliver a publication the registry already completed")
				.isEqualTo(1L);
	}

	private String codeOf(SeededBooking booking) {
		return jdbc.sql("SELECT code FROM booking WHERE id = :id")
				.param("id", booking.id()).query(String.class).single();
	}

	/** Fill both threads and the single configured queue slot, so the next submission is rejected. */
	private void saturateMailPool() {
		for (int i = 0; i < POOL_SIZE + QUEUE_CAPACITY; i++) {
			publishConfirmedBooking();
		}
		assertThat(probe.awaitBlockedSends(POOL_SIZE, WAIT))
				.as("the mail pool never filled, so saturation was not exercised").isTrue();
	}

	private double shedCount() {
		return meters.counter(ConfirmationMailExecutorConfig.SHED_COUNTER).count();
	}

	private long outstandingFor(long bookingId) {
		return jdbc.sql("""
				SELECT count(*) FROM event_publication
				WHERE listener_id = :listener AND completion_date IS NULL
				  AND serialized_event LIKE :needle
				""")
				.param("listener", EXPECTED_LISTENER_ID)
				.param("needle", "%\"bookingId\":{\"value\":" + bookingId + "}%")
				.query(Long.class).single();
	}

	private List<String> listenerIdsFor(String eventType) {
		return jdbc.sql("""
				SELECT listener_id FROM event_publication_archive WHERE event_type = :type
				UNION ALL
				SELECT listener_id FROM event_publication WHERE event_type = :type
				""")
				.param("type", eventType).query(String.class).list();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	private long accrualsFor(long bookingId) {
		return jdbc.sql("SELECT count(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	private void publishConfirmedBooking() {
		SeededBooking booking = seed("CONFIRMED");
		publishInTransaction(confirmedEvent(booking));
	}

	private BookingConfirmed confirmedEvent(SeededBooking booking) {
		SetRef set = onlineSet();
		return new BookingConfirmed(new BookingId(booking.id()), new VenueId(set.venueId()),
				new SetId(set.setId()), booking.date(), AMOUNT_MINOR, "EUR");
	}

	/** Publish inside a transaction so the AFTER_COMMIT registry-backed listeners are triggered. */
	private void publishInTransaction(Object event) {
		new TransactionTemplate(txManager).executeWithoutResult(status -> publisher.publishEvent(event));
	}

	/**
	 * Seed one booking with a code, contact address and date unique across the whole class. Every value
	 * is derived from one counter rather than hand-coordinated per test: the earlier hand-picked
	 * constants collided the moment two tests both saturated the pool (`customer_email_uniq`), and the
	 * dates must not collide either — classes sharing this context share one container and a claimed
	 * {@code (set, date)} is never released (invariant #2).
	 */
	private SeededBooking seed(String status) {
		int n = SEQ.incrementAndGet();
		LocalDate date = BOOKING_DATE.plusDays(n);
		SetRef set = onlineSet();
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Bulkhead Guest', '+355777') RETURNING id")
				.param("e", "bulkhead-" + n + "@example.com").query(Long.class).single();
		long bookingId = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, :amount, 'EUR', :status)
				RETURNING id
				""")
				.param("code", "BULKHD" + n).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customerId).param("date", date).param("amount", AMOUNT_MINOR)
				.param("status", status)
				.query(Long.class).single();
		return new SeededBooking(bookingId, date);
	}

	private record SeededBooking(long id, LocalDate date) {
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id")))
				.single();
	}

	private record SetRef(long setId, long venueId) {
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class ProbeMailerConfiguration {

		@Bean
		@Primary
		ProbeMailer probeMailer(DataSource dataSource) {
			return new ProbeMailer(dataSource);
		}
	}

	/**
	 * Records the transactional context and thread the transport is called on, and can park sends on a
	 * latch to model a wedged relay. Deliberately not a mock: the assertions are about the caller's
	 * thread state at the moment of the send, which only real in-transport code can observe.
	 */
	static final class ProbeMailer implements Mailer {

		private final DataSource dataSource;
		private final AtomicInteger blocked = new AtomicInteger();
		private final List<String> delivered = new CopyOnWriteArrayList<>();

		private volatile CountDownLatch sent = new CountDownLatch(1);
		private volatile CountDownLatch gate;
		private volatile boolean failing;
		private volatile boolean transactionActive = true;
		private volatile boolean connectionBound = true;
		private volatile String sendThreadName = "";

		ProbeMailer(DataSource dataSource) {
			this.dataSource = dataSource;
		}

		@Override
		public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
			transactionActive = TransactionSynchronizationManager.isActualTransactionActive();
			connectionBound = TransactionSynchronizationManager.hasResource(dataSource);
			sendThreadName = Thread.currentThread().getName();
			sent.countDown();

			if (failing) {
				// What a relay outage looks like to the listener: the throw is load-bearing, since it is
				// what keeps the publication outstanding for the registry to retry.
				throw new IllegalStateException("probe: simulated transport failure");
			}
			delivered.add(confirmation.bookingCode());

			CountDownLatch parked = gate;
			if (parked != null) {
				blocked.incrementAndGet();
				try {
					parked.await();
				}
				catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
				finally {
					blocked.decrementAndGet();
				}
			}
		}

		@Override
		public void sendEmailVerification(String toEmail, URI verificationLink) {
		}

		@Override
		public void sendPasswordReset(String toEmail, URI resetLink) {
		}

		/** The bean is a context singleton, so each test re-arms the latch and the recorded state. */
		void reset() {
			releaseSends();
			failing = false;
			delivered.clear();
			sent = new CountDownLatch(1);
			transactionActive = true;
			connectionBound = true;
			sendThreadName = "";
		}

		void blockSends() {
			gate = new CountDownLatch(1);
		}

		/** Model a relay outage: every send throws, as the real transport does (#371's propagation rule). */
		void failSends() {
			failing = true;
		}

		void deliverSends() {
			failing = false;
		}

		/** How many times this booking code was actually handed to the transport. */
		long deliveriesOf(String code) {
			return delivered.stream().filter(code::equals).count();
		}

		void releaseSends() {
			CountDownLatch parked = gate;
			gate = null;
			if (parked != null) {
				parked.countDown();
			}
		}

		boolean awaitSend(Duration timeout) throws InterruptedException {
			return sent.await(timeout.toMillis(), TimeUnit.MILLISECONDS);
		}

		/** Poll until {@code count} sends are parked — the pool's threads are then all occupied. */
		boolean awaitBlockedSends(int count, Duration timeout) {
			try {
				Awaitility.await().atMost(timeout).until(() -> blocked.get() >= count);
				return true;
			}
			catch (org.awaitility.core.ConditionTimeoutException e) {
				return false;
			}
		}

		boolean transactionActive() {
			return transactionActive;
		}

		boolean connectionBound() {
			return connectionBound;
		}

		String sendThreadName() {
			return sendThreadName;
		}
	}
}
