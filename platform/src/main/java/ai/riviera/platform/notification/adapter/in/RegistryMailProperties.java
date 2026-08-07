package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The bounds of the registry-mail bulkhead ({@link RegistryMailExecutorConfig}), externalised so they
 * can be retuned against a real relay from the deploy environment rather than by code change. Unset
 * config reproduces the original compile-time constants exactly.
 *
 * <p>The shipped values live in {@code application.properties}; the {@code @DefaultValue}s below are a
 * backstop for a context bound without it. The {@code ${RIVIERA_REGISTRY_MAIL_*:…}} placeholders are
 * also the only reason the readable env-var names work — relaxed binding of
 * {@code riviera.notification.registry-mail.pool-size} would be
 * {@code RIVIERA_NOTIFICATION_REGISTRYMAIL_POOLSIZE}. <strong>Deleting those two property lines keeps
 * the defaults working while silently breaking the env override</strong>, which is what
 * {@code RegistryMailPropertiesTest#theEnvironmentOverridesBothBounds} catches.
 *
 * <p><strong>Both knobs are validated on BOTH ends, because every invalid value boots clean.</strong>
 * {@code ThreadPoolTaskExecutor.createQueue} returns a {@link java.util.concurrent.SynchronousQueue}
 * for any capacity {@code <= 0} — {@code 0} reads as "unbounded" to a human and means "capacity zero"
 * to Spring — and a lazily-allocated {@code LinkedBlockingQueue} for <em>any</em> positive one, so an
 * absurd value is just the unbounded queue this bulkhead removed, restored by configuration. Core
 * threads are lazy too, so an oversized pool fails later as {@code OutOfMemoryError: unable to create
 * native thread}, on the commit thread {@link RegistryMailExecutorConfig}'s shed handler exists to keep
 * exceptions off. The ceilings bound the typo, not the operator.
 *
 * <p>A compact constructor rather than {@code @Validated} + {@code @Min}: Boot validates
 * {@code @ConfigurationProperties} only with a JSR-303 implementation on the classpath, and there is
 * none by deliberate choice, so an annotation here would validate nothing.
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
