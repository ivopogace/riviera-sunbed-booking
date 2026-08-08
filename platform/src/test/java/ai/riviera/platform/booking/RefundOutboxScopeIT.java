package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import org.awaitility.Awaitility;
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
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.refund.RefundOutbox;
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
 * The guarantee that makes the admin lever safe: <strong>a button labelled "refund" can reach
 * exactly one listener</strong> (AC-2), and it never re-drives a refund already settled (AC-8).
 *
 * <p><strong>Why the fixture holds an outstanding {@code PaymentConfirmed}.</strong> The defect the
 * issue's original scope proposal would have shipped — a {@code booking} package-prefix sweep — is
 * only reachable through {@code PaymentEventListener}, which subscribes to {@code payment}'s events,
 * not to {@code BookingCancelled}. A {@code BookingCancelled}-only fixture never exercises it and
 * would pass green with the scope wrong; this one re-drives with a stuck payment confirmation in the
 * registry and asserts it stays stuck.
 *
 * <p><strong>How each out-of-scope row is left genuinely outstanding.</strong> The payout reversal is
 * the easy one: a refunded cancellation with no {@code ACCRUAL} to mirror <em>defers</em> (throws,
 * publication stays outstanding), so seeding no accrual leaves it owed by the production
 * path itself. The cancellation mail and the payment confirmation complete normally, so their own
 * archived rows are lifted back into the live table marked {@code FAILED} — the registry's rows,
 * verbatim, never hand-built: a hand-built row the registry silently skips is indistinguishable from
 * the scope working (which two drafts of {@code MailOutboxScopeIT} paid for).
 *
 * <p><strong>The control is the load-bearing half.</strong> "Nothing happened to that row" is exactly
 * what a dead row looks like too. So the test ends by re-driving the same rows through an
 * <em>unscoped</em> predicate — after seeding the accrual the reversal was waiting for — and asserts
 * each one completes: the reversal writes its ledger entry, the payment confirmation completes as an
 * idempotent no-op, the mail redelivers. The only thing that stood between them and the registry was
 * the scope.
 *
 * <p><strong>Driving the port, not the endpoint.</strong> The subject is the scope, so these tests
 * call {@link RefundOutbox} directly; going through {@code RefundResubmission} would drag in the
 * cooldown (seeded at construction, so it would refuse the first call), which has its own tests
 * against a controllable clock (R-7).
 *
 * <p>The nested {@link ControllableRefundConfiguration} gives this class its own context; assertions
 * are keyed to this test's bookings via improbable amounts. Testcontainers; skipped without Docker.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, RefundOutboxScopeIT.ControllableRefundConfiguration.class })
@SpringBootTest
class RefundOutboxScopeIT {

	private static final Duration WAIT = Duration.ofSeconds(20);

	/** Improbable enough to identify one test's rows in a database shared across this class's tests. */
	private static final long SCOPE_REFUND_MINOR = 454_000_701L;

	private static final long CONFIRMED_AMOUNT_MINOR = 454_000_702L;

	private static final long SETTLED_REFUND_MINOR = 454_000_703L;

	private static final String CONFIRMED_PAYMENT_INTENT = "pi_refund_outbox_scope_454";

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

	@Autowired
	RefundOutbox outbox;

	private TransactionTemplate transactions;

	@BeforeEach
	void resetGateway() {
		transactions = new TransactionTemplate(txManager);
		gateway.reset();
	}

	/**
	 * AC-2. One outstanding refund, one outstanding payment confirmation, and the same cancellation's
	 * outstanding payout reversal and cancellation mail sit in the registry together — the fan-out the
	 * issue names. The scoped re-drive settles the refund and must leave the other three untouched.
	 */
	@Test
	void resubmitsTheRefundWithoutTouchingAnyOtherListener() {
		SetRef set = onlineSet();

		LocalDate confirmDate = LocalDate.of(2033, 6, 5);
		long confirmedBooking = seedBooking(set, "RFOSPAY1", confirmDate, "scope-pay@example.com",
				CONFIRMED_AMOUNT_MINOR, "AWAITING_PAYMENT");
		publishInTransaction(new PaymentConfirmed(new BookingRef(confirmedBooking), CONFIRMED_PAYMENT_INTENT));
		Awaitility.await("the payment confirmed its booking and the publication archived").atMost(WAIT)
				.until(() -> "CONFIRMED".equals(statusOf(confirmedBooking))
						&& archivedRow("%PaymentEventListener%", CONFIRMED_PAYMENT_INTENT) != null);
		UUID stuckConfirmation = reopenArchivedRow(archivedRow("%PaymentEventListener%", CONFIRMED_PAYMENT_INTENT));

		LocalDate cancelDate = LocalDate.of(2033, 6, 7);
		long cancelledBooking = seedBooking(set, "RFOSCAN1", cancelDate, "scope-cancel@example.com",
				SCOPE_REFUND_MINOR, "CANCELLED");
		gateway.failEveryRefund(true);
		publishInTransaction(cancellationOf(set, cancelledBooking, cancelDate, SCOPE_REFUND_MINOR));
		Awaitility.await("the failed refund and the deferred reversal are both outstanding").atMost(WAIT)
				.until(() -> outstanding("%BookingRefundListener%", SCOPE_REFUND_MINOR) == 1L
						&& outstanding("%BookingCancelledPayoutListener%", SCOPE_REFUND_MINOR) == 1L);
		Awaitility.await("the cancellation mail delivered and archived").atMost(WAIT)
				.until(() -> archivedRow("%BookingCancellationMailListener%", String.valueOf(SCOPE_REFUND_MINOR)) != null);
		UUID stuckMail = reopenArchivedRow(
				archivedRow("%BookingCancellationMailListener%", String.valueOf(SCOPE_REFUND_MINOR)));

		gateway.failEveryRefund(false);
		int resubmitted = outbox.resubmitOutstanding();

		Awaitility.await("the refund was re-driven and settled").atMost(WAIT)
				.until(() -> gateway.completionsFor(cancelledBooking) >= 1L
						&& outstanding("%BookingRefundListener%", SCOPE_REFUND_MINOR) == 0L);
		assertThat(resubmitted).as("the refund publication was in scope").isPositive();
		assertThat(isOutstanding(stuckConfirmation))
				.as("the payment -> confirm spine must not be re-driven by the refund lever (invariant #8)")
				.isTrue();
		assertThat(isOutstanding(stuckMail))
				.as("the cancellation mail is notification's, not this lever's")
				.isTrue();
		assertThat(reversalsFor(cancelledBooking))
				.as("the deferred payout reversal stays deferred — no ledger entry (invariants #9/#428)")
				.isZero();

		seedAccrual(cancelledBooking, set.venueId());
		resubmitUnscoped(cancelledBooking, confirmedBooking);

		Awaitility.await("the control proves all three skipped rows were live").atMost(WAIT)
				.until(() -> reversalsFor(cancelledBooking) == 1L
						&& !isOutstanding(stuckConfirmation)
						&& !isOutstanding(stuckMail));
	}

	/**
	 * AC-8. A refund the registry has already completed is archived out of {@code event_publication}
	 * under {@code completion-mode=archive} — not filtered, absent. Pressing the lever afterwards asks
	 * the gateway nothing.
	 */
	@Test
	void leavesCompletedPublicationsAlone() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2033, 7, 6);
		long bookingId = seedBooking(set, "RFOSDONE", date, "scope-settled@example.com",
				SETTLED_REFUND_MINOR, "CANCELLED");

		publishInTransaction(cancellationOf(set, bookingId, date, SETTLED_REFUND_MINOR));
		Awaitility.await("the refund settled and its publication completed").atMost(WAIT)
				.until(() -> gateway.completionsFor(bookingId) == 1L
						&& outstanding("%BookingRefundListener%", SETTLED_REFUND_MINOR) == 0L);

		outbox.resubmitOutstanding();

		assertThat(gateway.completionsFor(bookingId))
				.as("a completed refund is archived out of the live table — nothing to re-drive")
				.isEqualTo(1L);
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
						+ "VALUES (:e, 'Refund Outbox Guest', '+355783') RETURNING id")
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

	/** The accrual the deferred reversal has been waiting to mirror — seeded for the control. */
	private void seedAccrual(long bookingId, long venueId) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (booking_id, venue_id, entry_type,
				                                 gross_minor, commission_minor, net_minor, currency)
				VALUES (:booking, :venue, 'ACCRUAL', :gross, 0, :gross, 'EUR')
				""")
				.param("booking", bookingId).param("venue", venueId).param("gross", SCOPE_REFUND_MINOR)
				.update();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	private long reversalsFor(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'REVERSAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	private long outstanding(String listenerLike, long amountMarker) {
		return jdbc.sql("""
				SELECT COUNT(*) FROM event_publication
				WHERE completion_date IS NULL AND listener_id LIKE :listener
				  AND serialized_event LIKE :marker
				""")
				.param("listener", listenerLike)
				.param("marker", "%" + amountMarker + "%")
				.query(Long.class).single();
	}

	/** This test's archived publication for a listener, or {@code null} until it completes. */
	private UUID archivedRow(String listenerLike, String marker) {
		return jdbc.sql("""
				SELECT id FROM event_publication_archive
				WHERE listener_id LIKE :listener AND serialized_event LIKE :marker
				""")
				.param("listener", listenerLike)
				.param("marker", "%" + marker + "%")
				.query(UUID.class).optional().orElse(null);
	}

	/**
	 * Copies an archived publication back into the live table under a fresh id — the registry's own
	 * row, verbatim, minus its completion. In SQL so no listener id, event type or serialization is
	 * restated: a hand-built row the registry silently skips is a false green, and the v2
	 * repository's claim ({@code STATUS != 'RESUBMITTED'}) never matches a NULL status, so the status
	 * is set to what a listener that threw leaves behind.
	 */
	private UUID reopenArchivedRow(UUID archivedId) {
		return jdbc.sql("""
				INSERT INTO event_publication
				    (id, listener_id, event_type, serialized_event, publication_date, status, completion_attempts)
				SELECT gen_random_uuid(), listener_id, event_type, serialized_event, publication_date, 'FAILED', 1
				FROM event_publication_archive WHERE id = :id
				RETURNING id
				""")
				.param("id", archivedId).query(UUID.class).single();
	}

	private boolean isOutstanding(UUID publicationId) {
		return jdbc.sql("SELECT COUNT(*) FROM event_publication WHERE id = :id AND completion_date IS NULL")
				.param("id", publicationId).query(Long.class).single() == 1L;
	}

	/** The control: the same rows, re-driven with the scope removed but narrowed to this test's bookings. */
	private void resubmitUnscoped(long cancelledBooking, long confirmedBooking) {
		incompletePublications.resubmitIncompletePublications(publication -> switch (publication.getEvent()) {
			case BookingCancelled cancelled -> cancelled.bookingId().value() == cancelledBooking;
			case PaymentConfirmed confirmed -> confirmed.bookingRef().value() == confirmedBooking;
			default -> false;
		});
	}

	// ---- the controllable gateway ------------------------------------------------------------

	@TestConfiguration
	static class ControllableRefundConfiguration {

		@Bean
		@Primary
		ControllableRefundPort controllableRefundPort() {
			return new ControllableRefundPort();
		}
	}

	/**
	 * A {@link RefundPort} that can be made to fail and counts settlements per booking — the seam
	 * {@code booking} actually depends on ({@code payment::api}), so nothing reaches into
	 * {@code payment}'s internals (invariant #11). Slimmer than {@code RefundBulkheadIT}'s: this class
	 * asserts scope, not thread or connection hygiene.
	 */
	static final class ControllableRefundPort implements RefundPort {

		private record Attempt(long bookingId, boolean completed) { }

		private final List<Attempt> attempts = new CopyOnWriteArrayList<>();

		private final AtomicBoolean failing = new AtomicBoolean();

		@Override
		public RefundResult refund(BookingRef booking, Money amount) {
			long bookingId = booking.value();
			if (failing.get()) {
				attempts.add(new Attempt(bookingId, false));
				return new RefundResult.Failed("controlled_failure");
			}
			attempts.add(new Attempt(bookingId, true));
			return new RefundResult.Refunded("re_scope_" + bookingId);
		}

		void failEveryRefund(boolean fail) {
			failing.set(fail);
		}

		void reset() {
			failing.set(false);
			attempts.clear();
		}

		long completionsFor(long bookingId) {
			return attempts.stream().filter(a -> a.bookingId() == bookingId && a.completed()).count();
		}
	}
}
