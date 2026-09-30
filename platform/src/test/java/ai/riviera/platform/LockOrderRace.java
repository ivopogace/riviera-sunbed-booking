package ai.riviera.platform;

import java.time.Duration;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Predicate;

import org.awaitility.Awaitility;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Two transactions in a chosen interleaving, for the lock-order ITs (#1305): {@code holder} runs until it returns
 * from the {@link PausingPorts} pause, holding its locks; {@code racer} starts and is released into the rest of the
 * holder only once it is seen blocked by the holder's backend ({@code pg_blocking_pids}). A lock-order inversion
 * then aborts one side with {@code 40P01}, surfacing as that side's exception.
 */
public final class LockOrderRace {

	private static final Duration WAIT = Duration.ofSeconds(15);

	private LockOrderRace() {
	}

	/** What each side answered, and whether the racer ever waited on the holder. */
	public record Outcome<H, R>(H held, R raced, boolean racerWaited) {
	}

	public static <H, R> Outcome<H, R> race(JdbcClient jdbc, String pauseAfter, Predicate<Object[]> when,
			Callable<H> holder, Callable<R> racer) throws Exception {
		CompletableFuture<Integer> holderPid = new CompletableFuture<>();
		PausingPorts.Pause pause = PausingPorts.arm(pauseAfter, when,
				() -> holderPid.complete(jdbc.sql("SELECT pg_backend_pid()").query(Integer.class).single()));
		AtomicBoolean racerWaited = new AtomicBoolean();
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			try {
				Future<H> held = pool.submit(holder);
				Awaitility.await().atMost(WAIT).until(() -> holderPid.isDone() || held.isDone());
				if (!holderPid.isDone()) {
					held.get();
					throw new IllegalStateException("the holder finished without reaching the pause after " + pauseAfter);
				}
				int pid = holderPid.get();
				Future<R> raced = pool.submit(racer);
				Awaitility.await().atMost(WAIT).until(() -> {
					if (blockedBy(jdbc, pid) > 0) {
						racerWaited.set(true);
					}
					return racerWaited.get() || raced.isDone();
				});
				pause.release();
				return new Outcome<>(held.get(WAIT.toSeconds(), TimeUnit.SECONDS),
						raced.get(WAIT.toSeconds(), TimeUnit.SECONDS), racerWaited.get());
			}
			finally {
				pause.release();
				PausingPorts.disarm();
			}
		}
	}

	private static long blockedBy(JdbcClient jdbc, int pid) {
		return jdbc.sql("SELECT COUNT(*) FROM pg_stat_activity WHERE :pid = ANY (pg_blocking_pids(pid))")
				.param("pid", pid).query(Long.class).single();
	}
}
