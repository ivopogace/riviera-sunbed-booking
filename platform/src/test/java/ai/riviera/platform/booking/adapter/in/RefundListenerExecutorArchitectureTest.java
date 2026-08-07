package ai.riviera.platform.booking.adapter.in;

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
 * Fitness function: a {@code booking} listener that reaches the payment gateway must do it behind the
 * bulkhead — not just the one listener that does today. The twin of
 * {@code MailListenerExecutorArchitectureTest}, guarding the same trap for a different transport.
 * Rationale: RESPONSIBILITIES.md §`booking`.
 *
 * <p><strong>What the rule demands:</strong> {@code @Async(RefundExecutorConfig.REFUND_EXECUTOR)} +
 * {@code @TransactionalEventListener} at {@code AFTER_COMMIT}. The executor half is the bulkhead. The
 * transactional half is durability: a plain {@code @EventListener} runs inside the publishing
 * transaction, so it can refund against a commit that never happens, and it leaves no
 * {@code event_publication} row for {@code republish-outstanding-events-on-restart} to retry — which
 * for a refund is the entire automatic retry story for money owed under invariant #10.
 *
 * <p><strong>Scope: listeners that reach {@code payment::api}, not every listener in
 * {@code booking}.</strong> That distinction is the whole design of this rule.
 * {@link PaymentEventListener} is an {@code @ApplicationModuleListener} in the very same package and
 * belongs exactly where it is — DB-only work that <em>is</em> the spine, so moving it to a smaller
 * pool would shed money-path work. What separates the two is not the package or the annotation but
 * whether the listener makes a blocking external round-trip, and {@code payment.api} —
 * {@code RefundPort}, {@code CheckoutPort} — is precisely where those live.
 * {@link #thePaymentEventListenerIsOutOfScopeAndCorrectlySo} asserts that boundary rather than
 * leaving it to a reader.
 *
 * <p><strong>ArchUnit discovers, reflection asserts</strong>, for the reasons its notification twin
 * states. Discovery uses {@link ArchitectureTestSupport#productionClasses()}, which excludes the test
 * source set, so {@link RefundListenerRuleFixtures} can stand in this package without reading as a
 * production violation.
 */
class RefundListenerExecutorArchitectureTest {

	private static final String BOOKING_PACKAGE = "ai.riviera.platform.booking";

	/** Where the blocking gateway ports live: {@code RefundPort}, {@code CheckoutPort}. */
	private static final String PAYMENT_API_PACKAGE = "ai.riviera.platform.payment.api";

	// ---- the production gate ------------------------------------------------------------------

	@Test
	void everyBookingListenerReachingTheGatewayNamesTheRefundExecutor() {
		List<String> violations = executorIsolationViolations(gatewayReachingListeners());

		assertTrue(violations.isEmpty(), () -> "Refund-executor isolation violations (#404):\n - "
				+ String.join("\n - ", violations));
	}

	/**
	 * Guards against a vacuously-green rule. Two filters stand between a class on the classpath and an
	 * actual assertion — the production import and the {@code payment::api} scope — so this asserts the
	 * one production listener that must be examined survives both. Without it, a scope predicate that
	 * quietly stopped matching would leave the rule permanently, invisibly green.
	 */
	@Test
	void theRuleExaminesTheRefundListener() {
		List<Class<?>> examined = gatewayReachingListeners().stream()
				.map(Method::getDeclaringClass)
				.toList();

		assertTrue(examined.contains(BookingRefundListener.class),
				"Expected the rule to examine BookingRefundListener under " + BOOKING_PACKAGE
						+ " — a listener the scope predicate swallows is a listener free to put a gateway "
						+ "round-trip back on the money-path pool; examined: " + examined);
	}

	/**
	 * The other half of the scope, asserted rather than assumed: {@link PaymentEventListener} is an
	 * {@code @ApplicationModuleListener} in this very package, and it is <em>correct</em>. It confirms
	 * bookings and releases abandoned ones — DB-only work that is itself the spine — so demanding it
	 * move to the refund pool would be this rule failing code that is right.
	 *
	 * <p>Non-vacuous by construction: were it in scope it would be reported, because
	 * {@link #revertingToApplicationModuleListenerIsRejected} proves that exact annotation is rejected.
	 * So an absence here is the scope predicate working, not a check that quietly stopped applying.
	 */
	@Test
	void thePaymentEventListenerIsOutOfScopeAndCorrectlySo() {
		List<Class<?>> examined = gatewayReachingListeners().stream()
				.map(Method::getDeclaringClass)
				.toList();

		assertFalse(examined.contains(PaymentEventListener.class),
				"PaymentEventListener is DB-only and IS the money-path spine; putting it on a smaller "
						+ "dedicated pool would shed money-path work, which is strictly worse than the "
						+ "starvation the bulkhead prevents (#383 Non-goals). It must stay out of scope");
	}

	// ---- the rule's own behaviour, proven against fixtures -------------------------------------

	/**
	 * The non-vacuity proof for the rule itself, run against a fixture rather than by temporarily
	 * reverting production code: {@code @ApplicationModuleListener} is exactly what
	 * {@link BookingRefundListener} would revert to, and it must be rejected.
	 */
	@Test
	void revertingToApplicationModuleListenerIsRejected() {
		List<String> violations = executorIsolationViolations(
				listenersOf(RefundListenerRuleFixtures.CompositeListener.class));

		assertTrue(violations.stream().anyMatch(v -> v.contains("Boot's shared applicationTaskExecutor")),
				() -> "Expected @ApplicationModuleListener to be rejected for running on the shared pool, "
						+ "but got: " + violations);
	}

	@Test
	void theCompliantShapePasses() {
		List<String> violations = executorIsolationViolations(
				listenersOf(RefundListenerRuleFixtures.CompliantListener.class));

		assertTrue(violations.isEmpty(), () -> "The prescribed shape must pass — a rule that rejects "
				+ "everything teaches nothing: " + violations);
	}

	/** Spring resolves {@code @Async} method-first then type, so a class-level one is compliant. */
	@Test
	void classLevelAsyncIsHonoured() {
		List<String> violations = executorIsolationViolations(
				listenersOf(RefundListenerRuleFixtures.ClassLevelAsyncListener.class));

		assertTrue(violations.isEmpty(), () -> "A class-level @Async(REFUND_EXECUTOR) is how Spring "
				+ "itself resolves the executor; reporting it as \"no @Async at all\" would be a false "
				+ "failure: " + violations);
	}

	@Test
	void listenerWithNoAsyncIsRejected() {
		List<String> violations = executorIsolationViolations(
				listenersOf(RefundListenerRuleFixtures.InlineListener.class));

		assertTrue(violations.stream().anyMatch(v -> v.contains("no @Async at all")),
				() -> "Expected a listener with no @Async to be rejected — it would run the gateway "
						+ "round-trip inline on the committing thread, but got: " + violations);
	}

	@Test
	void plainEventListenerIsRejected() {
		List<String> violations = executorIsolationViolations(
				listenersOf(RefundListenerRuleFixtures.PlainAsyncListener.class));

		assertTrue(violations.stream().anyMatch(v -> v.contains("plain @EventListener")),
				() -> "Expected a plain @Async + @EventListener to be examined and rejected — it refunds "
						+ "inside the publishing transaction and leaves no event_publication row to "
						+ "republish, but got: " + violations);
	}

	// ---- the rule, as a pure function of the listeners handed to it ----------------------------

	private static List<String> executorIsolationViolations(List<Method> listeners) {
		List<String> violations = new ArrayList<>();
		for (Method listener : listeners) {
			addDurabilityViolation(listener, violations);
			addExecutorViolation(listener, violations);
		}
		return violations;
	}

	private static void addDurabilityViolation(Method listener, List<String> violations) {
		TransactionalEventListener transactional =
				AnnotatedElementUtils.findMergedAnnotation(listener, TransactionalEventListener.class);
		if (transactional == null) {
			violations.add(describe(listener) + " is a plain @EventListener — it runs inside the publishing "
					+ "transaction, so it can refund against a commit that never happens, and it leaves no "
					+ "event_publication row to republish on restart, which is the whole retry story for "
					+ "money owed (invariant #10). Write @Async(RefundExecutorConfig.REFUND_EXECUTOR) + "
					+ "@TransactionalEventListener");
		}
		else if (transactional.phase() != TransactionPhase.AFTER_COMMIT) {
			violations.add(describe(listener) + " listens at " + transactional.phase() + " rather than "
					+ TransactionPhase.AFTER_COMMIT + " — money must not move before the cancellation it "
					+ "answers has committed");
		}
	}

	private static void addExecutorViolation(Method listener, List<String> violations) {
		Async async = mergedAsync(listener);
		if (async == null) {
			violations.add(describe(listener) + " is an event listener with no @Async at all — "
					+ "it would run the gateway round-trip inline on the committing thread");
		}
		else if (!RefundExecutorConfig.REFUND_EXECUTOR.equals(async.value())) {
			violations.add(describe(listener) + " runs on "
					+ (async.value().isEmpty() ? "Boot's shared applicationTaskExecutor" : "'" + async.value() + "'")
					+ " rather than '" + RefundExecutorConfig.REFUND_EXECUTOR + "' — a blocking gateway call "
					+ "there can back up the money path (#404). Note @ApplicationModuleListener takes no "
					+ "executor qualifier: write out @Async(RefundExecutorConfig.REFUND_EXECUTOR) + "
					+ "@TransactionalEventListener instead");
		}
	}

	/** Method-first, then type — the order Spring's own {@code @Async} resolution uses. */
	private static Async mergedAsync(Method listener) {
		Async onMethod = AnnotatedElementUtils.findMergedAnnotation(listener, Async.class);
		return onMethod != null ? onMethod
				: AnnotatedElementUtils.findMergedAnnotation(listener.getDeclaringClass(), Async.class);
	}

	// ---- discovery -----------------------------------------------------------------------------

	/**
	 * Every production event listener in {@code booking} whose declaring class reaches
	 * {@code payment::api} — i.e. whose work includes a blocking gateway round-trip.
	 */
	private static List<Method> gatewayReachingListeners() {
		List<Method> listeners = new ArrayList<>();
		for (JavaClass type : ArchitectureTestSupport.productionClasses()) {
			if (!inBookingModule(type.getPackageName()) || !reachesGatewayPort(type)) {
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

	private static boolean reachesGatewayPort(JavaClass type) {
		return type.getDirectDependenciesFromSelf().stream()
				.anyMatch(dependency ->
						dependency.getTargetClass().getPackageName().equals(PAYMENT_API_PACKAGE));
	}

	/**
	 * The listener methods a fixture declares. Asserts it found some, so a fixture that stops being a
	 * listener fails loudly instead of turning its negative-proof test vacuously green.
	 */
	private static List<Method> listenersOf(Class<?> fixture) {
		List<Method> listeners = Arrays.stream(fixture.getDeclaredMethods())
				.filter(RefundListenerExecutorArchitectureTest::isEventListener)
				.toList();
		assertFalse(listeners.isEmpty(), fixture.getSimpleName() + " declares no event listener — "
				+ "the fixture it is meant to embody is gone");
		return listeners;
	}

	private static boolean isEventListener(Method method) {
		return AnnotatedElementUtils.findMergedAnnotation(method, EventListener.class) != null;
	}

	private static boolean inBookingModule(String packageName) {
		return packageName.equals(BOOKING_PACKAGE) || packageName.startsWith(BOOKING_PACKAGE + ".");
	}

	private static String describe(Method listener) {
		return listener.getDeclaringClass().getSimpleName() + "#" + listener.getName();
	}
}
