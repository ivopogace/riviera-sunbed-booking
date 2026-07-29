package ai.riviera.platform.notification.adapter.in;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.event.TransactionalEventListener;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaMethod;

import ai.riviera.platform.ArchitectureTestSupport;

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
 * <p><strong>ArchUnit discovers, reflection asserts.</strong> The assertion is about <em>merged</em>
 * annotation attributes — the executor name surviving whatever meta-annotation composed it — which
 * is {@link AnnotatedElementUtils}' job, and it lets the rule name the very constant the production
 * {@code @Async} uses instead of re-typing the bean name and hoping the two stay in step. Finding
 * the candidates is a separate question, and the answer is the shared
 * {@link ArchitectureTestSupport#productionClasses()} import every sibling rule already uses:
 * it excludes the test source set. A {@code ClassPathScanningCandidateComponentProvider} does not —
 * it resolves {@code classpath*:}, which under Gradle spans {@code build/classes/java/main}
 * <em>and</em> {@code .../test} — so before #409 a recording listener in an IT, the plausible way
 * to test #373 and #374, would have failed this rule with a violation naming no production code at
 * all. {@link MailListenerRuleFixtures} keeps that closed by standing in the scanned package.
 */
class MailListenerExecutorArchitectureTest {

	private static final String NOTIFICATION_PACKAGE = "ai.riviera.platform.notification";

	@Test
	void everyNotificationEventListenerNamesTheMailExecutor() {
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

	@Test
	void testScopeListenersAreNotCollected() {
		List<String> collectedFixtures = notificationEventListeners().stream()
				.map(Method::getDeclaringClass)
				.filter(type -> type.getEnclosingClass() == MailListenerRuleFixtures.class)
				.map(Class::getSimpleName)
				.toList();

		assertTrue(collectedFixtures.isEmpty(), () -> "The rule collected test-scope fixtures "
				+ collectedFixtures + " — a test fixture under " + NOTIFICATION_PACKAGE
				+ " must not read as a production violation (#409 hole 1)");
	}

	private static List<Method> notificationEventListeners() {
		List<Method> listeners = new ArrayList<>();
		for (JavaClass type : ArchitectureTestSupport.productionClasses()) {
			if (!inNotificationModule(type.getPackageName())) {
				continue;
			}
			for (JavaMethod method : type.getMethods()) {
				Method reflected = method.reflect();
				if (AnnotatedElementUtils.findMergedAnnotation(reflected, TransactionalEventListener.class) != null) {
					listeners.add(reflected);
				}
			}
		}
		return listeners;
	}

	private static boolean inNotificationModule(String packageName) {
		return packageName.equals(NOTIFICATION_PACKAGE)
				|| packageName.startsWith(NOTIFICATION_PACKAGE + ".");
	}

	private static String describe(Method listener) {
		return listener.getDeclaringClass().getSimpleName() + "#" + listener.getName();
	}
}
