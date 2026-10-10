package ai.riviera.platform.notification;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.sql.DataSource;

import org.springframework.transaction.support.TransactionSynchronizationManager;

import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;
import ai.riviera.platform.notification.application.StayConfirmationMail;

/**
 * A transport whose latency and failure are the test's to choose — the "deliberately blocking
 * mailer" AC-1 asks for. It also records the sending thread's transactional context, which
 * is {@code RegistryMailBulkheadIT}'s AC-7 assertion.
 *
 * <p>Shared by every IT that drives the registry mail vehicle through
 * {@link ControllableMailerConfiguration}. Those that wedge it release the gate unconditionally in
 * their {@code @AfterEach}: {@code RegistryMailBulkheadIT} proves the money path overtakes a hanging
 * relay, {@code RegistryCompletionOrderIT} holds a send to pin completion order, and
 * {@code RegistryMailShedDurabilityIT} fills the bulkhead's pool and queue so the next send is shed.
 * One implementation rather than several near-copies, because the subtleties below are the kind a
 * copy quietly loses.
 *
 * <p><strong>Two flags, not one, because the weaker one alone can be satisfied while the harm
 * remains.</strong> {@code isActualTransactionActive()} goes false under
 * {@code @Transactional(NOT_SUPPORTED)} — but with no transaction to suspend,
 * {@code AbstractPlatformTransactionManager} takes its "empty transaction" branch,
 * {@code newSynchronization} follows the default {@code SYNCHRONIZATION_ALWAYS}, and
 * {@code DataSourceUtils} then binds the first read's {@code ConnectionHolder} for the whole method
 * scope. The connection — the resource this class exists to protect — stays pinned across the SMTP
 * round-trip. Only {@code hasResource(dataSource)} sees that, and only dropping {@code @Transactional}
 * outright makes it false.
 */
public final class ControllableMailer implements Mailer {

	/**
	 * How long a wedged send stays wedged if the owning test's release somehow never runs; the
	 * wedging importers release unconditionally in their {@code @AfterEach}, so this only backstops a
	 * deadlock. It must comfortably outlast every wait in a single test — a gate that reopens on its
	 * own part-way through unwedges the pool and lets the money-path assertions pass for the wrong
	 * reason, which is how the first draft of {@code RegistryMailBulkheadIT} went green against the
	 * unfixed listener. It is a deadlock backstop, not a timing knob.
	 */
	private static final Duration GATE_BACKSTOP = Duration.ofMinutes(2);

	/**
	 * Replaced per test, not merely counted down: a {@link CountDownLatch} is single-use, so one
	 * shared instance would stay open for every test after the first release and silently stop
	 * blocking anything — a wedging test that wedges nothing still passes its money-path assertions.
	 */
	private volatile CountDownLatch gate = new CountDownLatch(1);

	private final DataSource dataSource;
	private final AtomicBoolean blocking = new AtomicBoolean();
	private final AtomicBoolean failing = new AtomicBoolean();
	private final List<String> entered = new CopyOnWriteArrayList<>();
	private final List<String> delivered = new CopyOnWriteArrayList<>();
	private final List<Boolean> transactionActive = new CopyOnWriteArrayList<>();
	private final List<Boolean> connectionBound = new CopyOnWriteArrayList<>();

	ControllableMailer(DataSource dataSource) {
		this.dataSource = dataSource;
	}

	@Override
	public void sendEmailVerification(String toEmail, URI verificationLink) {
		// Not exercised here; the recovery vehicle has its own pool and its own tests.
	}

	@Override
	public void sendPasswordReset(String toEmail, URI resetLink) {
		// See above.
	}

	@Override
	public void sendOperatorApproved(String toEmail, URI signInLink) {
		// See above — also a recovery-vehicle kind, so also not this pool's business.
	}

	@Override
	public void sendBookingConfirmation(String toEmail, BookingConfirmationMail confirmation) {
		observeRegistrySend(toEmail);
	}

	@Override
	public void sendStayConfirmation(String toEmail, StayConfirmationMail confirmation) {
		observeRegistrySend(toEmail);
	}

	/**
	 * The cancellation rides the same vehicle, so it is observed identically rather than
	 * stubbed out. A no-op here would make a cancellation invisible to every bulkhead assertion —
	 * "the spine stays responsive while the transport hangs" would silently stop covering half the
	 * registry traffic the day someone pointed one of these ITs at a cancellation.
	 */
	@Override
	public void sendBookingCancellation(String toEmail, BookingCancellationMail cancellation) {
		observeRegistrySend(toEmail);
	}

	/** The payment-due notice is the third kind on this vehicle — observed, for the reason above. */
	@Override
	public void sendPaymentDue(String toEmail, PaymentDueMail paymentDue) {
		observeRegistrySend(toEmail);
	}

	/** The two request-outcome records are the fourth and fifth — observed, same reason. */
	@Override
	public void sendRequestDeclined(String toEmail, RequestDeclinedMail declined) {
		observeRegistrySend(toEmail);
	}

	@Override
	public void sendRequestExpired(String toEmail, RequestExpiredMail expired) {
		observeRegistrySend(toEmail);
	}

	/** The changed-spot notice is the sixth kind on this vehicle — observed, same reason. */
	@Override
	public void sendBookingMoved(String toEmail, BookingMovedMail moved) {
		observeRegistrySend(toEmail);
	}

	/** A refunded day's mail rides the same vehicle — observed, same reason. */
	@Override
	public void sendDayRefund(String toEmail, ai.riviera.platform.notification.application.DayRefundMail refund) {
		observeRegistrySend(toEmail);
	}

	/** The move reminder rides the same vehicle — observed, same reason. */
	@Override
	public void sendMoveReminder(String toEmail, ai.riviera.platform.notification.application.MoveReminderMail reminder) {
		observeRegistrySend(toEmail);
	}

	private void observeRegistrySend(String toEmail) {
		entered.add(toEmail);
		transactionActive.add(TransactionSynchronizationManager.isActualTransactionActive());
		connectionBound.add(TransactionSynchronizationManager.hasResource(dataSource));
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

	public void block() {
		blocking.set(true);
	}

	public void failEverySend(boolean fail) {
		failing.set(fail);
	}

	public void release() {
		blocking.set(false);
		gate.countDown();
	}

	public void reset() {
		entered.clear();
		delivered.clear();
		transactionActive.clear();
		connectionBound.clear();
		blocking.set(false);
		failing.set(false);
		gate = new CountDownLatch(1);
	}

	public long attemptsMatching(String addressPrefix) {
		return entered.stream().filter(address -> address.startsWith(addressPrefix)).count();
	}

	public long deliveriesMatching(String addressPrefix) {
		return delivered.stream().filter(address -> address.startsWith(addressPrefix)).count();
	}

	public List<Boolean> transactionActive() {
		return List.copyOf(transactionActive);
	}

	public List<Boolean> connectionBound() {
		return List.copyOf(connectionBound);
	}
}
