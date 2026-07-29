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

import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.Mailer;

/**
 * A transport whose latency and failure are the test's to choose — the "deliberately blocking
 * mailer" #383's AC-1 asks for. It also records the sending thread's transactional context, which
 * is {@code RegistryMailBulkheadIT}'s AC-7 assertion.
 *
 * <p>Shared by the two ITs that drive the registry mail vehicle (extracted from the bulkhead class
 * at #407, unchanged): {@code RegistryMailBulkheadIT} wedges it to prove the money path overtakes a
 * hanging relay, and {@code RegistryMailShedDurabilityIT} wedges it to fill the bulkhead's pool and
 * queue so the next send is shed. One implementation rather than two near-copies, because the
 * subtleties below are the kind a second copy quietly loses.
 *
 * <p><strong>Two flags, not one, because the weaker one alone can be satisfied while the harm
 * remains.</strong> {@code isActualTransactionActive()} goes false under
 * {@code @Transactional(NOT_SUPPORTED)} — but with no transaction to suspend,
 * {@code AbstractPlatformTransactionManager} takes its "empty transaction" branch,
 * {@code newSynchronization} follows the default {@code SYNCHRONIZATION_ALWAYS}, and
 * {@code DataSourceUtils} then binds the first read's {@code ConnectionHolder} for the whole method
 * scope. The connection — the resource #383 is actually about — stays pinned across the SMTP
 * round-trip. Only {@code hasResource(dataSource)} sees that, and only dropping {@code @Transactional}
 * outright makes it false.
 */
public final class ControllableMailer implements Mailer {

	/**
	 * How long a wedged send stays wedged if the owning test's release somehow never runs. It must
	 * comfortably outlast every wait in a single test — a gate that reopens on its own part-way
	 * through unwedges the pool and lets the money-path assertions pass for the wrong reason, which is
	 * how the first draft of {@code RegistryMailBulkheadIT} went green against the unfixed listener. It
	 * is a deadlock backstop, not a timing knob.
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
