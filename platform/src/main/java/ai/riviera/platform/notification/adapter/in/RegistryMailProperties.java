package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The bounds of the registry-mail bulkhead ({@link RegistryMailExecutorConfig}), externalised at #408
 * so #370 can retune them from the deploy environment. #383 chose them against <em>estimated</em>
 * worst-case timeouts — two threads and ≈50 minutes of backlog at 2 × ~30s — and the first thing real
 * relay traffic does is falsify an estimate; as compile-time constants, correcting one cost a code
 * change, a PR and a deploy. The shipped defaults reproduce those constants exactly, so unset config
 * is byte-for-byte the behaviour #383 pinned.
 *
 * <p><strong>Both knobs are validated here, not annotated.</strong> A non-positive
 * {@code queue-capacity} is not a harmless value:
 * {@code ThreadPoolTaskExecutor.createQueue} returns a {@link java.util.concurrent.SynchronousQueue}
 * for any capacity {@code <= 0}, so a typo would boot cleanly and silently convert the bulkhead into
 * a pool that sheds every send it cannot hand straight to a free thread — worse than the starvation
 * #383 exists to prevent, and invisible. {@code 0} reads as "unbounded" to a human and means
 * "capacity zero" to Spring, which is exactly the gap a guard has to close.
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

	RegistryMailProperties {
		if (poolSize <= 0) {
			throw new IllegalArgumentException(
					"riviera.notification.registry-mail.pool-size must be at least 1, but was " + poolSize);
		}
		if (queueCapacity <= 0) {
			throw new IllegalArgumentException(
					"riviera.notification.registry-mail.queue-capacity must be at least 1, but was "
							+ queueCapacity + "; a non-positive capacity yields a SynchronousQueue, which sheds "
							+ "every send that cannot be handed straight to a free thread");
		}
	}
}
