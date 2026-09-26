package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Bounds of the registry-mail bulkhead ({@link RegistryMailExecutorConfig}). Keep the
 * {@code ${RIVIERA_REGISTRY_MAIL_*:…}} lines in {@code application.properties}: without them the env
 * override silently stops binding ({@code RegistryMailPropertiesTest}). Every invalid value boots clean,
 * so the compact constructor checks both ends; {@code @Validated} would check nothing (no JSR-303).
 *
 * @param poolSize core <em>and</em> max threads, equal: a pool grows past core only on a full queue
 * @param queueCapacity sends that may back up before the pool sheds to the Event Publication Registry
 */
@ConfigurationProperties("riviera.notification.registry-mail")
record RegistryMailProperties(@DefaultValue("2") int poolSize, @DefaultValue("200") int queueCapacity) {

	/** 16× the shipped 2. Past this the pool stops being the small thing the spine's pool is protected from. */
	static final int MAX_POOL_SIZE = 32;

	/** 50× the shipped 200 — ≈40 hours of backlog, long past where the registry is the better queue. */
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
