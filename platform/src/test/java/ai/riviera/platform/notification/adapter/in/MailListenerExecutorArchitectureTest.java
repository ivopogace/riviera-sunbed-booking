package ai.riviera.platform.notification.adapter.in;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.event.TransactionalEventListener;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The fitness function behind #383 AC-4: <em>every</em> mail path honours the isolation rule
 * {@code AsyncMailDispatcher} states, not just the two that exist today.
 *
 * <p>The regression this exists to prevent is silent and cheap to make. {@code @ApplicationModuleListener}
 * is the documented, obvious way to write a registry-backed listener — {@code riviera-modulith}'s own
 * events reference shows it — and it expands to a bare {@code @Async}, which is Boot's shared
 * {@code applicationTaskExecutor}: the pool carrying payment→booking confirmation (invariant #8) and
 * booking→payout accrual (invariant #9). #369 bought that isolation for recovery mail and wrote down
 * why; #371 then landed a per-confirmed-booking send on the shared pool, and nothing failed. Epic #367
 * still has registry-borne mails to write (#373 request-accepted, #374 cancellation/refund), each of
 * which would reach for the same annotation. A rule is the only thing that makes the second one fail
 * loudly instead of shipping the same defect twice.
 *
 * <p>Reflection rather than ArchUnit on purpose: the assertion is about <em>merged</em> annotation
 * attributes — the executor name surviving whatever meta-annotation composed it — which is
 * {@link AnnotatedElementUtils}' job, and it lets the rule name the very constant the production
 * {@code @Async} uses instead of re-typing the bean name and hoping the two stay in step.
 */
class MailListenerExecutorArchitectureTest {

	private static final String NOTIFICATION_PACKAGE = "ai.riviera.platform.notification";

	@Test
	void everyNotificationEventListenerNamesTheMailExecutor() throws Exception {
		List<Method> listeners = notificationEventListeners();
		List<String> violations = new ArrayList<>();

		for (Method listener : listeners) {
			Async async = AnnotatedElementUtils.findMergedAnnotation(listener, Async.class);
			if (async == null) {
				violations.add(describe(listener) + " is a transactional event listener with no @Async at all — "
						+ "it would run inline on the committing thread");
			}
			else if (!RegistryMailExecutorConfig.MAIL_EXECUTOR.equals(async.value())) {
				violations.add(describe(listener) + " runs on "
						+ (async.value().isEmpty() ? "Boot's shared applicationTaskExecutor" : "'" + async.value() + "'")
						+ " rather than '" + RegistryMailExecutorConfig.MAIL_EXECUTOR + "' — a mail send there can "
						+ "back up the money path (#383). Note @ApplicationModuleListener takes no executor "
						+ "qualifier: write out @Async(RegistryMailExecutorConfig.MAIL_EXECUTOR) + "
						+ "@TransactionalEventListener instead");
			}
		}

		assertFalse(listeners.isEmpty(), "no event listener found under " + NOTIFICATION_PACKAGE
				+ " — the rule would be vacuously green; check the scanner's package filter");
		assertTrue(violations.isEmpty(), () -> "Mail-executor isolation violations (#383):\n - "
				+ String.join("\n - ", violations));
	}

	private static List<Method> notificationEventListeners() throws ClassNotFoundException {
		ClassPathScanningCandidateComponentProvider scanner =
				new ClassPathScanningCandidateComponentProvider(false);
		scanner.addIncludeFilter(new AssignableTypeFilter(Object.class));

		List<Method> listeners = new ArrayList<>();
		for (BeanDefinition definition : scanner.findCandidateComponents(NOTIFICATION_PACKAGE)) {
			Class<?> type = Class.forName(definition.getBeanClassName());
			for (Method method : type.getDeclaredMethods()) {
				if (AnnotatedElementUtils.findMergedAnnotation(method, TransactionalEventListener.class) != null) {
					listeners.add(method);
				}
			}
		}
		return listeners;
	}

	private static String describe(Method listener) {
		return listener.getDeclaringClass().getSimpleName() + "#" + listener.getName();
	}
}
