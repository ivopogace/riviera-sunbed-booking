package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The bounds of the registry-mail bulkhead ({@link RegistryMailExecutorConfig}), externalised at #408
 * so #370 can retune them from the deploy environment. #383 chose them against <em>estimated</em>
 * worst-case timeouts — two threads and ≈50 minutes of backlog at 2 × ~30s — and the first thing real
 * relay traffic does is falsify an estimate; as compile-time constants, correcting one cost a code
 * change, a PR and a deploy. Unset config reproduces those constants exactly, so the behaviour #383
 * pinned is byte-for-byte unchanged.
 *
 * <p><strong>The values that ship live in {@code application.properties}, not here.</strong> The
 * {@code @DefaultValue}s below are a backstop for a context bound without that file; production
 * always reads the {@code ${RIVIERA_REGISTRY_MAIL_*:…}} placeholders, and those placeholders are also
 * the only reason the readable env-var names work at all — the relaxed-binding form of
 * {@code riviera.notification.registry-mail.pool-size} would be
 * {@code RIVIERA_NOTIFICATION_REGISTRYMAIL_POOLSIZE}. Deleting the two property lines would therefore
 * keep the defaults working while silently breaking the env override #370 needs;
 * {@code RegistryMailPropertiesTest#theEnvironmentOverridesBothBounds} is what catches that.
 *
 * <p><strong>Both knobs are validated here, not annotated, and on BOTH sides.</strong> A non-positive
 * {@code queue-capacity} is not a harmless value:
 * {@code ThreadPoolTaskExecutor.createQueue} returns a {@link java.util.concurrent.SynchronousQueue}
 * for any capacity {@code <= 0}, so a typo would boot cleanly and silently convert the bulkhead into
 * a pool that sheds every send it cannot hand straight to a free thread — worse than the starvation
 * #383 exists to prevent, and invisible. {@code 0} reads as "unbounded" to a human and means
 * "capacity zero" to Spring, which is exactly the gap a guard has to close.
 *
 * <p><strong>The upper bounds close the same hole from the other end</strong>, and they exist because
 * the first draft of #408 argued they were unnecessary on the grounds that "an absurd value fails
 * loudly." It does not. {@code createQueue} returns a {@code LinkedBlockingQueue} for <em>any</em>
 * positive capacity and that queue allocates its nodes lazily, so
 * {@code queue-capacity=1000000} boots cleanly, reports healthy, and sheds nothing — it is the
 * unbounded queue #383 removed, restored by configuration, with the shed counter pinned at zero while
 * the heap fills with retained {@code BookingConfirmed} payloads until the JVM dies and takes the
 * money-path listeners with it. A large {@code pool-size} is the mirror image: core threads are
 * created lazily too, so nothing fails at boot, and the failure arrives later as
 * {@code OutOfMemoryError: unable to create native thread} thrown from {@code execute()} on the
 * commit thread — the one thread {@link RegistryMailExecutorConfig}'s shed handler exists to keep
 * exceptions off. Both ceilings are far above any plausible tuning (16× and 50× the shipped
 * defaults); they bound the typo, not the operator.
 *
 * <p>The guard is a compact constructor rather than {@code @Validated} + {@code @Min} because Boot
 * validates {@code @ConfigurationProperties} only when a JSR-303 implementation is on the classpath,
 * and there is none: #97 declined {@code spring-boot-starter-validation} deliberately, in favour of
 * explicit checks in records (the house idiom, {@code riviera-java-conventions} §2/§6b). An
 * annotation here would bind and validate nothing — the same silent degradation, reached from the
 * other side.
 *
 * @param poolSize core <em>and</em> max threads; they are equal by design, since a
 *        {@code ThreadPoolExecutor} grows past core only once the queue is full
 * @param queueCapacity sends that may back up before the pool sheds to the Event Publication
 *        Registry, which is the better queue past that point
 */
@ConfigurationProperties("riviera.notification.registry-mail")
record RegistryMailProperties(@DefaultValue("2") int poolSize, @DefaultValue("200") int queueCapacity) {

	/** 16× the shipped 2. Past this the pool stops being the small thing the spine's pool is protected from. */
	static final int MAX_POOL_SIZE = 32;

	/** 50× the shipped 200 — ≈40 hours of backlog at 2 × ~30s, long past where the registry is the better queue. */
	static final int MAX_QUEUE_CAPACITY = 10_000;

	RegistryMailProperties {
		if (poolSize <= 0 || poolSize > MAX_POOL_SIZE) {
			throw new IllegalArgumentException(
					"riviera.notification.registry-mail.pool-size must be between 1 and " + MAX_POOL_SIZE
							+ ", but was " + poolSize + "; core threads are created lazily, so an oversized pool "
							+ "does not fail at boot — it fails later as OutOfMemoryError: unable to create "
							+ "native thread, on the transaction-commit thread this pool exists to protect");
		}
		if (queueCapacity <= 0 || queueCapacity > MAX_QUEUE_CAPACITY) {
			throw new IllegalArgumentException(
					"riviera.notification.registry-mail.queue-capacity must be between 1 and "
							+ MAX_QUEUE_CAPACITY + ", but was " + queueCapacity
							+ "; a non-positive capacity yields a SynchronousQueue, which sheds every send that "
							+ "cannot be handed straight to a free thread, and an oversized one restores the "
							+ "unbounded queue this bulkhead exists to remove — it boots clean, sheds nothing, "
							+ "and fills the heap instead");
		}
	}
}
