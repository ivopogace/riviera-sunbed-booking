package ai.riviera.platform;

import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethodCall;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static ai.riviera.platform.ArchitectureTestSupport.fixtureClasses;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * The platform-wide guard on shutdown drain (#456) — the rule the per-module one could not be.
 *
 * <p><strong>The defect this replaces.</strong> Pools that drain on shutdown are separate beans, and
 * {@code destroySingletons()} runs their {@code destroy()} methods <em>sequentially on one thread</em>,
 * so their windows <strong>add rather than overlap</strong>. #410 encoded that inside
 * {@code notification} as {@code MAIL_SHUTDOWN_BUDGET_MS / DRAINING_POOLS}, with a test asserting
 * {@code SHUTDOWN_BUDGET_MS * DRAINING_POOLS <= MAIL_SHUTDOWN_BUDGET_MS}. That assertion is
 * <strong>unfalsifiable</strong>: the left side is defined as the right side divided by the same
 * factor, and {@code (a / b) * b <= a} holds for every positive integer pair. Its only live assertion
 * was {@code DRAINING_POOLS == 2} — a change-detector that fires when someone edits the very constant
 * they would have had to remember to edit. #404 landed a third draining pool in {@code booking} and it
 * did not fire, which is the whole case for this class.
 *
 * <p><strong>Why bytecode and not the {@code ApplicationContext}.</strong> Discovering pools through
 * the context has two holes that read as green: the two bulkhead pools are declared
 * {@code defaultCandidate = false} (invisible to an injected {@code Map<String, ThreadPoolTaskExecutor>},
 * though not to {@code getBeansOfType}), and the recovery dispatcher's pool is <em>not a bean at all</em>
 * — it is a private field inside {@code AsyncMailDispatcher}, a {@code DisposableBean}. A scan missing
 * that one would omit a third of the budget and report healthy. Every draining pool, bean or not, must
 * call {@code setAwaitTerminationMillis} on the {@code ThreadPoolTaskExecutor} it configures, so reading
 * call sites finds all three by construction and needs no special case for either hole.
 *
 * <p><strong>What the scan deliberately cannot see, and why that is safe.</strong> ArchUnit reads the
 * call, not its argument, so a pool passing {@code setWaitForTasksToCompleteOnShutdown(false)} is
 * counted as draining when it is not. That direction is the safe one — an over-counted pool makes the
 * budget tighter, never looser, and it fails the build rather than passing it. Do not "fix" it by
 * narrowing the marker set: the argument is not in the bytecode this rule reads.
 *
 * <p>The shape is {@code ScheduledWorkArchitectureTest}'s, for the same reason it has it — a committed
 * number fixes today and rots tomorrow, so the rule encodes the number's <em>reason</em>: every pool
 * that spends the grace must be accounted for, and their claims must sum inside it.
 */
class ShutdownDrainArchitectureTest {

	/**
	 * The calls that create a drain window. {@code setAwaitTerminationMillis} is the primary marker —
	 * {@code ExecutorConfigurationSupport.awaitTerminationIfNecessary} gates the wait on it being
	 * positive — and the other is included because a pool declaring one without the other is exactly
	 * the half-configured case worth surfacing to a human.
	 */
	private static final Set<String> DRAIN_MARKERS = Set.of(
			"setAwaitTerminationMillis", "setWaitForTasksToCompleteOnShutdown");

	/**
	 * Spring's executor package. Matching the owner by package rather than by
	 * {@code isAssignableTo(ThreadPoolTaskExecutor.class)} keeps the rule independent of whether
	 * ArchUnit resolved the Spring type hierarchy, which it need not have for a type outside the
	 * imported packages — a resolution failure would silently empty the scan.
	 */
	private static final String SPRING_EXECUTOR_PACKAGE = "org.springframework.scheduling.concurrent.";

	/**
	 * Today's draining pools. Extending this set is the deliberate cost of adding a fourth: it is the
	 * moment someone confirms the grace can carry it and declares its claim in {@code ShutdownBudget}.
	 */
	private static final Set<String> KNOWN_DRAINING_POOLS = Set.of(
			"AsyncMailDispatcher", "RefundExecutorConfig", "RegistryMailExecutorConfig");

	@Test
	void everyDrainingPoolIsAccountedFor() {
		assertThat(drainingPools(PRODUCTION_CLASSES))
				.as("a pool that drains on shutdown spends the platform's SIGTERM grace, and the windows"
						+ " ADD rather than overlap — account for it here and declare its claim")
				.containsExactlyInAnyOrderElementsOf(new TreeSet<>(KNOWN_DRAINING_POOLS));
	}

	@Test
	void theDetectorFindsAnOversizedFixturePool() {
		assertThat(drainingPools(fixtureClasses("ai.riviera.drainfixture")))
				.as("non-vacuity: a detector that finds nothing satisfies every rule built on it"
						+ " trivially, which is precisely how the guard this replaces stayed green")
				.containsExactly("OversizedDrainingPool");
	}

	/** Simple names of every class configuring a pool that drains on shutdown. */
	private static Set<String> drainingPools(JavaClasses classes) {
		Set<String> pools = new TreeSet<>();
		for (JavaClass type : classes) {
			for (JavaMethodCall call : type.getMethodCallsFromSelf()) {
				if (isDrainMarker(call)) {
					pools.add(type.getSimpleName());
				}
			}
		}
		return pools;
	}

	private static boolean isDrainMarker(JavaMethodCall call) {
		return DRAIN_MARKERS.contains(call.getTarget().getName())
				&& call.getTargetOwner().getName().startsWith(SPRING_EXECUTOR_PACKAGE);
	}
}
