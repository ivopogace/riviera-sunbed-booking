package ai.riviera.platform.notification.adapter.in;

import java.time.Duration;
import java.time.LocalDate;

import io.micrometer.core.instrument.MeterRegistry;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.notification.BookingMailFixtures;
import ai.riviera.platform.notification.BookingMailFixtures.SetRef;
import ai.riviera.platform.notification.ControllableMailer;
import ai.riviera.platform.notification.ControllableMailerConfiguration;
import ai.riviera.platform.shared.ObservabilityMetrics;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What shedding <em>costs</em> (#407) — the half of {@link RegistryMailExecutorConfig}'s saturation
 * contract that was reasoning rather than coverage.
 *
 * <p>That contract has two clauses. The pool sheds rather than throwing or running on the caller's
 * thread; and shedding is safe <em>because</em> "a shed send's Event Publication Registry row is
 * still outstanding, so {@code republish-outstanding-events-on-restart} re-delivers it." Only the
 * first clause was proven. {@code RegistryMailExecutorConfigTest} sheds against a bare
 * {@link ThreadPoolTaskExecutor} — no registry, no {@code event_publication} table, no listener, so
 * it cannot see what a shed costs — and {@code RegistryMailBulkheadIT} wedges the transport without
 * ever overflowing the queue. This class closes that gap against the real registry, which matters
 * because the losslessness claim is exactly what #370 leans on the day a real relay is behind the
 * bulkhead: shedding a confirmation is only acceptable if the mail is still <em>owed</em>.
 *
 * <p><strong>Its own context, and therefore its own database — that is the isolation, not a
 * convention.</strong> Saturating a 2-thread/200-slot pool through the listener would mean 202
 * wedged sends, so the pool is shrunk to 1/1 via the properties #408 externalised. #406 did that
 * with a class-wide {@code @TestPropertySource} in a class whose other tests deliberately leave
 * publications outstanding, and the two halves produced a reproducible flake (1-in-7 clean runs).
 * Here the distinct property set makes a distinct context cache key, and the Testcontainers Postgres
 * is a context-scoped {@code @ServiceConnection} bean — so this class gets a fresh database that no
 * other test's publications live in, and the shrunk pool cannot outlive the context. The resubmit
 * predicate is narrowed to the booking under test anyway: the discipline is worth keeping whether or
 * not the container is shared today.
 *
 * <p><strong>Nothing here is timed.</strong> Every step waits on observable pool state — the wedge's
 * entry into the transport, then a queue of exactly one — so the send that must be shed is published
 * only once the pool provably has nowhere to put it. The one deliberate exception is the shed
 * counter, asserted <em>immediately</em> rather than awaited: its promptness is part of the claim.
 * An {@code AFTER_COMMIT} listener is dispatched from inside {@code commit()}, so the rejection
 * happens on the committing thread before the publish returns — the same property that makes a
 * throwing rejection handler unacceptable. Awaiting it would quietly stop asserting that.
 * Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, ControllableMailerConfiguration.class })
@SpringBootTest
@TestPropertySource(properties = {
		"riviera.notification.registry-mail.pool-size=1",
		"riviera.notification.registry-mail.queue-capacity=1"
})
class RegistryMailShedDurabilityIT {

	private static final Duration WAIT = Duration.ofSeconds(20);

	/** The smallest bulkhead that can saturate: one worker to wedge, one slot to fill, then a shed. */
	private static final int SHRUNK_POOL_SIZE = 1;

	private static final int SHRUNK_QUEUE_CAPACITY = 1;

	/**
	 * Improbable amounts, one per booking, because a publication is matched on its serialized amount
	 * rather than on an id — see {@link BookingMailFixtures}.
	 */
	private static final long WEDGE_AMOUNT_MINOR = 407_000_701L;

	private static final long QUEUED_AMOUNT_MINOR = 407_000_702L;

	private static final long SHED_AMOUNT_MINOR = 407_000_703L;

	/** No address may be a prefix of another: the transport's counters match on prefix. */
	private static final String WEDGE_CONTACT = "shed-it-wedge@example.com";

	private static final String QUEUED_CONTACT = "shed-it-queued@example.com";

	private static final String SHED_CONTACT = "shed-it-target@example.com";

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

	@Autowired
	MeterRegistry meters;

	@Autowired
	ApplicationContext context;

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

	private ThreadPoolTaskExecutor mailPool() {
		return context.getBean(RegistryMailExecutorConfig.MAIL_EXECUTOR, ThreadPoolTaskExecutor.class);
	}

	private double shedCount() {
		return meters.counter(ObservabilityMetrics.MAIL_REGISTRY_SHED).count();
	}

	private void awaitQuietPool() {
		Awaitility.await("the mail pool is idle before the sequence begins").atMost(WAIT)
				.until(() -> mailPool().getQueueSize() == 0 && mailPool().getActiveCount() == 0);
	}

	private long publishConfirmation(SetRef set, String code, LocalDate date, String contact, long amountMinor) {
		long bookingId = fixtures.seedBooking(set, code, date, contact, amountMinor, "CONFIRMED");
		fixtures.publishInTransaction(fixtures.confirmationOf(set, bookingId, date, amountMinor));
		return bookingId;
	}

	/**
	 * A mis-bound property would otherwise surface as a 20-second timeout in the test below, whose
	 * message would say nothing about the cause. The shipped 2/200 are pinned in the default context
	 * by {@code RegistryMailExecutorWiringIT}; this asserts only that <em>this</em> context runs the
	 * shrunk pool the saturation sequence assumes.
	 */
	@Test
	void theBulkheadIsShrunkForThisContextOnly() {
		ThreadPoolTaskExecutor pool = mailPool();

		assertThat(pool.getCorePoolSize()).isEqualTo(SHRUNK_POOL_SIZE);
		assertThat(pool.getMaxPoolSize()).isEqualTo(SHRUNK_POOL_SIZE);
		assertThat(pool.getQueueCapacity())
				.as("saturation must be reachable in three sends; the shipped 200-slot queue is not")
				.isEqualTo(SHRUNK_QUEUE_CAPACITY);
	}

	/**
	 * The contract end to end: saturate, shed, and prove the shed mail is still owed — then collect on
	 * it the way a restart would.
	 *
	 * <p>The two assertions after the pool drains are the ones that carry the slice. That the shed
	 * booking's transport entry count is <em>still</em> zero once every worker is idle distinguishes a
	 * dropped send from a merely delayed one; that its publication is still outstanding is what makes
	 * the drop recoverable rather than a lost arrival code. The resubmit then closes the loop
	 * {@code republish-outstanding-events-on-restart} performs at boot, with the predicate narrowed to
	 * this booking — a blanket {@code publication -> true} is what made #406's branch flaky.
	 */
	@Test
	void aShedSendStaysOwedAndIsDeliveredByAResubmit() {
		SetRef set = fixtures.onlineSet();
		awaitQuietPool();
		transport.block();

		publishConfirmation(set, "SHEDWEDG", LocalDate.of(2032, 3, 1), WEDGE_CONTACT, WEDGE_AMOUNT_MINOR);
		Awaitility.await("the single worker is wedged in the transport").atMost(WAIT)
				.until(() -> transport.attemptsMatching(WEDGE_CONTACT) == 1L);

		publishConfirmation(set, "SHEDQUEU", LocalDate.of(2032, 3, 2), QUEUED_CONTACT, QUEUED_AMOUNT_MINOR);
		Awaitility.await("the single queue slot is taken, so the pool is at capacity").atMost(WAIT)
				.until(() -> mailPool().getQueueSize() == SHRUNK_QUEUE_CAPACITY);

		double shedBefore = shedCount();
		long shedBooking =
				publishConfirmation(set, "SHEDSHED", LocalDate.of(2032, 3, 3), SHED_CONTACT, SHED_AMOUNT_MINOR);

		assertThat(shedCount() - shedBefore)
				.as("an AFTER_COMMIT dispatch into a full pool is rejected on the committing thread, so "
						+ "the counter has already moved by the time the commit returns")
				.isGreaterThanOrEqualTo(1.0);

		transport.release();
		Awaitility.await("the wedged and queued sends drain once the transport recovers").atMost(WAIT)
				.until(() -> transport.deliveriesMatching(WEDGE_CONTACT) == 1L
						&& transport.deliveriesMatching(QUEUED_CONTACT) == 1L);
		awaitQuietPool();

		assertThat(transport.attemptsMatching(SHED_CONTACT))
				.as("a shed send is dropped, not deferred: an idle pool never picks it up")
				.isZero();
		assertThat(fixtures.outstandingMailPublications(SHED_AMOUNT_MINOR))
				.as("shedding is only lossless because the publication is still outstanding — this is the "
						+ "half of the contract nothing proved in a Spring context before #407")
				.isEqualTo(1L);

		incompletePublications.resubmitIncompletePublications(publication ->
				publication.getEvent() instanceof BookingConfirmed confirmed
						&& confirmed.bookingId().value() == shedBooking);

		Awaitility.await("the resubmit delivers the mail the pool shed").atMost(WAIT)
				.until(() -> transport.deliveriesMatching(SHED_CONTACT) == 1L);
		Awaitility.await("and the registry no longer owes it").atMost(WAIT)
				.until(() -> fixtures.outstandingMailPublications(SHED_AMOUNT_MINOR) == 0L);
	}
}
