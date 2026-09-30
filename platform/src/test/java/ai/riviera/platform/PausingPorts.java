package ai.riviera.platform;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Predicate;

import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.util.ClassUtils;

/**
 * Holds a thread inside a transaction at a chosen point, for the race ITs: every bean implementing one
 * of {@link #PORTS} is wrapped (an unordered post-processor, so after its transactional proxy), and a call
 * matching the armed {@link Pause} returns only once the test releases it, with the caller's locks still held.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PausingPorts {

	/** The ports a pause may sit behind, by name, so one configuration serves every module's IT. */
	private static final String[] PORTS = {
			"ai.riviera.platform.availability.api.AvailabilityClaim",
			"ai.riviera.platform.booking.application.Bookings",
			"ai.riviera.platform.customer.application.AccountErasureStore",
			"ai.riviera.platform.customer.application.CustomerAccountStore",
			"ai.riviera.platform.customer.application.CustomerAccountTokens",
			"ai.riviera.platform.customer.application.CustomerAccountTokens",
			"ai.riviera.platform.payout.application.PayoutLedger",
			"ai.riviera.platform.review.application.Reviews"};

	private static final AtomicReference<Pause> ARMED = new AtomicReference<>();

	/**
	 * One armed pause: the first call to {@code method} whose arguments match {@code when}, on any thread; {@code
	 * onReached} runs on that thread, inside its transaction, before it waits.
	 */
	public record Pause(String method, Predicate<Object[]> when, Runnable onReached, CountDownLatch reached,
			CountDownLatch go) {

		/** Waits until a caller sits in the pause, or fails. */
		public void awaitReached(Duration timeout) throws InterruptedException {
			if (!reached.await(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
				throw new IllegalStateException("no call reached the pause after " + method);
			}
		}

		public void release() {
			go.countDown();
		}
	}

	/** Arms a pause after {@code method}'s first matching call; release it and {@link #disarm} in a finally. */
	public static Pause arm(String method, Predicate<Object[]> when, Runnable onReached) {
		Pause pause = new Pause(method, when, onReached, new CountDownLatch(1), new CountDownLatch(1));
		ARMED.set(pause);
		return pause;
	}

	public static void disarm() {
		Pause pause = ARMED.getAndSet(null);
		if (pause != null) {
			pause.release();
		}
	}

	@Bean
	static BeanPostProcessor pausingPortsPostProcessor() {
		return new BeanPostProcessor() {
			@Override
			public Object postProcessAfterInitialization(Object bean, String beanName) {
				Class<?>[] interfaces = ClassUtils.getAllInterfaces(bean);
				for (Class<?> type : interfaces) {
					for (String port : PORTS) {
						if (type.getName().equals(port)) {
							return Proxy.newProxyInstance(bean.getClass().getClassLoader(), interfaces,
									(proxy, method, args) -> invokeAndMaybePause(bean, method, args));
						}
					}
				}
				return bean;
			}
		};
	}

	private static Object invokeAndMaybePause(Object target, java.lang.reflect.Method method, Object[] args)
			throws Throwable {
		Object result;
		try {
			result = method.invoke(target, args);
		}
		catch (InvocationTargetException failed) {
			throw failed.getCause();
		}
		Pause pause = ARMED.get();
		if (pause != null && pause.method().equals(method.getName()) && pause.when().test(args == null ? new Object[0] : args)
				&& ARMED.compareAndSet(pause, null)) {
			pause.onReached().run();
			pause.reached().countDown();
			if (!pause.go().await(30, TimeUnit.SECONDS)) {
				throw new IllegalStateException("the pause after " + method.getName() + " was never released");
			}
		}
		return result;
	}
}
