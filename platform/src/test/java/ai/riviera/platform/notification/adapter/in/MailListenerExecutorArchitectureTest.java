package ai.riviera.platform.notification.adapter.in;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.event.TransactionPhase;
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
 * <p><strong>What a {@code notification} listener of a platform event must be:</strong>
 * {@code @Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)} + {@code @TransactionalEventListener} at
 * {@code AFTER_COMMIT}. The executor half is the bulkhead. The transactional half is the durability
 * half and is not decoration: a plain {@code @EventListener} runs <em>inside</em> the publishing
 * transaction, so it can mail about a commit that never happens, and it leaves no
 * {@code event_publication} row for {@code republish-outstanding-events-on-restart} to retry — the
 * at-least-once guarantee {@code BookingConfirmationMailListener}'s Javadoc rests on. #409 asked
 * which of the two a non-transactional mail listener should fail; the answer is both, because they
 * are independent properties and each is separately load-bearing.
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
 *
 * <p><strong>The rule's boundaries, stated rather than assumed.</strong> A fitness function is only
 * as trustworthy as its edges are known, and #409 was filed because two of these were neither
 * closed nor written down:
 * <ul>
 *   <li><strong>Test scope is excluded</strong> (above) — deliberately, so #373's and #374's own
 *       recording listeners are free to exist. The cost is that this rule cannot police a listener
 *       that only exists in tests, which is the right trade: such a listener ships to nobody.</li>
 *   <li><strong>Every {@code @EventListener} spelling is examined</strong>, not just
 *       {@code @TransactionalEventListener}. The latter is itself meta-annotated with the former, so
 *       the old predicate was a strict subset and {@code @Async} + {@code @EventListener} — a mail
 *       send on any executor, inside the publishing transaction — was never looked at.</li>
 *   <li><strong>Only listeners of {@code ai.riviera.platform} events are in scope.</strong> A
 *       container-lifecycle listener ({@code ContextRefreshedEvent} and friends) is skipped: there
 *       is no publishing transaction to bind to, so demanding {@code @TransactionalEventListener}
 *       of it would be the #409 hole-1 mistake in a new costume — a rule failing code that is
 *       correct. The gap this leaves is a mail sent from a Spring lifecycle event, which is not a
 *       shape anything here has reason to write.</li>
 *   <li><strong>{@code @Async} is resolved method-first, then type</strong>, because Spring resolves
 *       it that way; a class-level {@code @Async(MAIL_EXECUTOR)} is a compliant spelling and must
 *       not read as "no {@code @Async} at all".</li>
 *   <li><strong>The rule is module-local.</strong> {@code booking}'s and {@code payout}'s
 *       {@code @ApplicationModuleListener}s belong on the shared pool — the bulkhead exists because
 *       mail makes a blocking network round-trip, not because async listeners are bad.</li>
 * </ul>
 */
class MailListenerExecutorArchitectureTest {

	private static final String NOTIFICATION_PACKAGE = "ai.riviera.platform.notification";

	private static final String PLATFORM_PACKAGE = "ai.riviera.platform";

	// ---- the production gate ----------------------------------------------------------------

	@Test
	void everyNotificationEventListenerNamesTheMailExecutor() {
		List<String> violations = executorIsolationViolations(notificationEventListeners());

		assertTrue(violations.isEmpty(), () -> "Mail-executor isolation violations (#383):\n - "
				+ String.join("\n - ", violations));
	}

	/**
	 * Guards against a vacuously-green rule. Two filters stand between a class on the classpath and
	 * an actual assertion — the production import and the platform-event carve-out — so this asserts
	 * every production listener survives <em>both</em>. Checking only that they were discovered would
	 * leave the rule green if the carve-out ever swallowed one.
	 *
	 * <p><strong>Named per listener, not counted.</strong> #374 was the case this guard was written
	 * for — it is the second listener the class Javadoc predicted — and it is also when the guard had
	 * to stop naming only the first: a rule that examines one of two listeners is half vacuous, and a
	 * bare count would go green again the moment a listener was added <em>and</em> another silently
	 * fell out of scope.
	 */
	@Test
	void theRuleExaminesBothProductionListeners() {
		List<Class<?>> examined = inScopeListeners(notificationEventListeners()).stream()
				.filter(listener -> "on".equals(listener.getName()))
				.map(Method::getDeclaringClass)
				.toList();

		assertTrue(examined.contains(BookingConfirmationMailListener.class),
				"Expected the rule to examine BookingConfirmationMailListener#on under "
						+ NOTIFICATION_PACKAGE + " — without it the rule is vacuously green; examined: "
						+ examined);
		assertTrue(examined.contains(BookingCancellationMailListener.class),
				"Expected the rule to examine BookingCancellationMailListener#on under "
						+ NOTIFICATION_PACKAGE + " — a listener the carve-out swallows is a listener free "
						+ "to land its send on the money-path pool; examined: " + examined);
	}

	// ---- the boundaries (#409) ---------------------------------------------------------------

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

	@Test
	void plainEventListenerIsRejected() {
		List<String> violations = executorIsolationViolations(
				listenersOf(MailListenerRuleFixtures.PlainAsyncListener.class));

		assertTrue(violations.stream().anyMatch(v -> v.contains("plain @EventListener")),
				() -> "Expected a plain @Async + @EventListener to be examined and rejected — it leaves no "
						+ "event_publication row and runs inside the publishing transaction (#409 hole 2), "
						+ "but got: " + violations);
	}

	/**
	 * The non-vacuity proof #409 AC-3 asks for, run against a fixture instead of by reverting
	 * production code: {@code @ApplicationModuleListener} is exactly what
	 * {@link BookingConfirmationMailListener} would revert to.
	 */
	@Test
	void revertingToApplicationModuleListenerIsRejected() {
		List<String> violations = executorIsolationViolations(
				listenersOf(MailListenerRuleFixtures.CompositeListener.class));

		assertTrue(violations.stream().anyMatch(v -> v.contains("Boot's shared applicationTaskExecutor")),
				() -> "Expected @ApplicationModuleListener to be rejected for running on the shared pool, "
						+ "but got: " + violations);
	}

	@Test
	void beforeCommitPhaseIsRejected() {
		List<String> violations = executorIsolationViolations(
				listenersOf(MailListenerRuleFixtures.BeforeCommitListener.class));

		assertTrue(violations.stream().anyMatch(v -> v.contains("BEFORE_COMMIT")),
				() -> "Expected a listener bound to a phase other than AFTER_COMMIT to be rejected — the "
						+ "registry's at-least-once story assumes the commit already happened, but got: "
						+ violations);
	}

	@Test
	void theCompliantShapePasses() {
		List<String> violations = executorIsolationViolations(
				listenersOf(MailListenerRuleFixtures.CompliantListener.class));

		assertTrue(violations.isEmpty(), () -> "The prescribed shape must pass — a rule that rejects "
				+ "everything teaches nothing: " + violations);
	}

	/** Spring resolves {@code @Async} method-first then type, so a class-level one is compliant. */
	@Test
	void classLevelAsyncIsHonoured() {
		List<String> violations = executorIsolationViolations(
				listenersOf(MailListenerRuleFixtures.ClassLevelAsyncListener.class));

		assertTrue(violations.isEmpty(), () -> "A class-level @Async(MAIL_EXECUTOR) is how Spring itself "
				+ "resolves the executor; reporting it as \"no @Async at all\" would be a false failure: "
				+ violations);
	}

	@Test
	void listenerWithNoAsyncIsRejected() {
		List<String> violations = executorIsolationViolations(
				listenersOf(MailListenerRuleFixtures.InlineListener.class));

		assertTrue(violations.stream().anyMatch(v -> v.contains("no @Async at all")),
				() -> "Expected a listener with no @Async to be rejected — it would run the send inline on "
						+ "the committing thread, but got: " + violations);
	}

	/**
	 * The carve-out must read the event type from {@code @EventListener#classes} as well as from the
	 * method parameter — Spring accepts both spellings, and a listener written the second way would
	 * otherwise fall out of scope unexamined. Asserted through a <em>rejection</em>, because "no
	 * violations" is indistinguishable from "silently skipped".
	 */
	@Test
	void anEventTypeDeclaredOnTheAnnotationIsInScope() {
		List<String> violations = executorIsolationViolations(
				listenersOf(MailListenerRuleFixtures.DeclaredEventTypeListener.class));

		assertTrue(violations.stream().anyMatch(v -> v.contains("no @Async at all")),
				() -> "Expected a listener declaring its platform event via @TransactionalEventListener("
						+ "classes = …) — no method parameter — to be examined and rejected, but got: "
						+ violations);
	}

	/**
	 * Non-vacuous by construction: {@code listenersOf} has asserted the fixture <em>is</em> a
	 * listener, and {@link MailListenerRuleFixtures.InlineListener} — the same annotations minus the
	 * platform event — is rejected by {@link #listenerWithNoAsyncIsRejected}. So an empty result here
	 * is the carve-out firing, not a check that quietly stopped applying.
	 */
	@Test
	void containerLifecycleListenerIsOutOfScope() {
		List<String> violations = executorIsolationViolations(
				listenersOf(MailListenerRuleFixtures.ContainerLifecycleListener.class));

		assertTrue(violations.isEmpty(), () -> "A ContextRefreshedEvent listener has no publishing "
				+ "transaction to bind to; demanding @TransactionalEventListener of it would be a false "
				+ "failure: " + violations);
	}

	// ---- the rule, as a pure function of the listeners handed to it --------------------------

	private static List<String> executorIsolationViolations(List<Method> listeners) {
		List<String> violations = new ArrayList<>();
		for (Method listener : inScopeListeners(listeners)) {
			addDurabilityViolation(listener, violations);
			addExecutorViolation(listener, violations);
		}
		return violations;
	}

	/** The carve-out, named so the non-vacuity guard can assert against the same filter the rule uses. */
	private static List<Method> inScopeListeners(List<Method> listeners) {
		return listeners.stream().filter(MailListenerExecutorArchitectureTest::listensToAPlatformEvent).toList();
	}

	private static void addDurabilityViolation(Method listener, List<String> violations) {
		TransactionalEventListener transactional =
				AnnotatedElementUtils.findMergedAnnotation(listener, TransactionalEventListener.class);
		if (transactional == null) {
			violations.add(describe(listener) + " is a plain @EventListener — it runs inside the publishing "
					+ "transaction, so it can mail about a commit that never happens, and it leaves no "
					+ "event_publication row to republish on restart. Write "
					+ "@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR) + @TransactionalEventListener");
		}
		else if (transactional.phase() != TransactionPhase.AFTER_COMMIT) {
			violations.add(describe(listener) + " listens at " + transactional.phase() + " rather than "
					+ TransactionPhase.AFTER_COMMIT + " — the registry vehicle's at-least-once guarantee "
					+ "assumes the commit the mail announces has already happened");
		}
	}

	private static void addExecutorViolation(Method listener, List<String> violations) {
		Async async = mergedAsync(listener);
		if (async == null) {
			violations.add(describe(listener) + " is an event listener with no @Async at all — "
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

	/** Method-first, then type — the order Spring's own {@code @Async} resolution uses. */
	private static Async mergedAsync(Method listener) {
		Async onMethod = AnnotatedElementUtils.findMergedAnnotation(listener, Async.class);
		return onMethod != null ? onMethod
				: AnnotatedElementUtils.findMergedAnnotation(listener.getDeclaringClass(), Async.class);
	}

	private static boolean listensToAPlatformEvent(Method listener) {
		if (Arrays.stream(listener.getParameterTypes()).anyMatch(MailListenerExecutorArchitectureTest::isPlatformType)) {
			return true;
		}
		EventListener listens = AnnotatedElementUtils.findMergedAnnotation(listener, EventListener.class);
		return listens != null
				&& Arrays.stream(listens.classes()).anyMatch(MailListenerExecutorArchitectureTest::isPlatformType);
	}

	private static boolean isPlatformType(Class<?> type) {
		return type.getName().startsWith(PLATFORM_PACKAGE + ".");
	}

	// ---- discovery ---------------------------------------------------------------------------

	private static List<Method> notificationEventListeners() {
		List<Method> listeners = new ArrayList<>();
		for (JavaClass type : ArchitectureTestSupport.productionClasses()) {
			if (!inNotificationModule(type.getPackageName())) {
				continue;
			}
			for (JavaMethod method : type.getMethods()) {
				Method reflected = method.reflect();
				if (isEventListener(reflected)) {
					listeners.add(reflected);
				}
			}
		}
		return listeners;
	}

	/**
	 * The listener methods a fixture declares. Asserts it found some, so a fixture that stops being
	 * a listener fails loudly instead of turning its negative-proof test vacuously green.
	 */
	private static List<Method> listenersOf(Class<?> fixture) {
		List<Method> listeners = Arrays.stream(fixture.getDeclaredMethods())
				.filter(MailListenerExecutorArchitectureTest::isEventListener)
				.toList();
		assertFalse(listeners.isEmpty(), fixture.getSimpleName() + " declares no event listener — "
				+ "the fixture it is meant to embody is gone");
		return listeners;
	}

	private static boolean isEventListener(Method method) {
		return AnnotatedElementUtils.findMergedAnnotation(method, EventListener.class) != null;
	}

	private static boolean inNotificationModule(String packageName) {
		return packageName.equals(NOTIFICATION_PACKAGE)
				|| packageName.startsWith(NOTIFICATION_PACKAGE + ".");
	}

	private static String describe(Method listener) {
		return listener.getDeclaringClass().getSimpleName() + "#" + listener.getName();
	}
}
