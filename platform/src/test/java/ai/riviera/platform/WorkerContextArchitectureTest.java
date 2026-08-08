package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import ai.riviera.platform.shared.MdcTaskDecorator;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethodCall;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.fixtureClasses;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every pool the platform configures itself must carry the submitting request's logging context.
 *
 * <p><strong>The defect this exists to prevent is one that already happened.</strong> An earlier slice gave both
 * mail pools an {@link MdcTaskDecorator} and wrote the rule down in prose. A later one then added a third
 * bounded pool, {@code bookingRefundExecutor}, without one — and nothing failed, because a comment is
 * not an assertion. Its worker lines were unattributable for two releases. This is the same shape, and
 * the same remedy, as {@code ShutdownDrainArchitectureTest}: encode the rule's <em>reason</em> so the
 * fourth pool cannot repeat the third's omission.
 *
 * <p><strong>Why the correlation id is the only handle.</strong> Invariant #7 keeps the booking code
 * and the recipient address out of these lines, so without the id a worker line says a refund failed
 * or a mail was lost, never <em>whose</em>. That is what makes an undecorated pool a real defect rather
 * than a tidiness point.
 *
 * <p><strong>Scoped to {@code ThreadPoolTaskExecutor}, deliberately.</strong> A
 * {@code ThreadPoolTaskScheduler} — which gives each scheduled sweep its own — has no <em>submitting
 * request</em> to inherit from, so requiring a decorator there would be meaningless. Boot's shared
 * {@code applicationTaskExecutor} is auto-configured rather than declared here, so it is structurally
 * invisible to this scan and stays undecorated on purpose (a stated non-goal: it carries the
 * invariant-#8/#9 spine listeners and decorating it changes money-path behaviour).
 *
 * <p><strong>What the scan deliberately cannot see.</strong> ArchUnit reads a class's dependencies, not
 * what a call actually passes, so a class that referenced {@link MdcTaskDecorator} without installing
 * it would satisfy this rule. That direction is the safe one — it cannot report a decorated pool as
 * undecorated, and it fails the build rather than passing it when the reference is absent entirely.
 * The <em>behaviour</em> is asserted per pool where it belongs, by the three
 * {@code aWorkerRunsWithTheSubmittersLoggingContext} tests; this rule's job is to make sure a fourth
 * pool has to think about it at all.
 */
class WorkerContextArchitectureTest {

	/**
	 * The type whose configuration implies pooled workers running other threads' work. Matched by name
	 * rather than by {@code isAssignableTo} so the rule does not depend on ArchUnit having resolved
	 * Spring's type hierarchy — a resolution failure would silently empty the scan, which is the one
	 * outcome a non-vacuity guard exists to catch.
	 */
	private static final String WORKER_POOL_TYPE =
			"org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor";

	/**
	 * Today's self-configured worker pools, <strong>fully qualified</strong> for
	 * {@code ShutdownDrainArchitectureTest}'s reason: these are {@code Set} keys, and every module has
	 * its own {@code adapter.in} package, so two similarly named {@code *ExecutorConfig} classes would
	 * collapse into one entry and leave a fourth pool uncounted.
	 *
	 * <p>Extending this set is the deliberate cost of adding a pool: it is the moment someone confirms
	 * the new one propagates context — and, next door, declares its drain claim in {@code ShutdownBudget}.
	 */
	private static final Set<String> KNOWN_WORKER_POOLS = Set.of(
			"ai.riviera.platform.notification.application.AsyncMailDispatcher",
			"ai.riviera.platform.notification.adapter.in.RegistryMailExecutorConfig",
			"ai.riviera.platform.booking.adapter.in.RefundExecutorConfig");

	/** The deliberately mis-shaped tree this detector's own proof runs against. */
	private static final String WORKER_FIXTURES = "ai.riviera.workercontextfixture";

	@Test
	void everySelfConfiguredWorkerPoolIsAccountedFor() {
		assertThat(workerPools(PRODUCTION_CLASSES))
				.as("a pool configured here runs other threads' work; account for it and give it the"
						+ " submitting request's logging context")
				.containsExactlyInAnyOrderElementsOf(new TreeSet<>(KNOWN_WORKER_POOLS));
	}

	@Test
	void everySelfConfiguredWorkerPoolCarriesTheSubmittersContext() {
		List<String> violations = new ArrayList<>();
		for (String pool : workerPools(PRODUCTION_CLASSES)) {
			if (!carriesTheSubmittersContext(PRODUCTION_CLASSES.get(pool))) {
				violations.add(pool + " configures a ThreadPoolTaskExecutor without an "
						+ MdcTaskDecorator.class.getSimpleName() + " — its workers' log lines carry no"
						+ " correlation id, and invariant #7 leaves nothing else to identify them by."
						+ " A pool whose decorator slot is already taken must COMPOSE via"
						+ " CompositeTaskDecorator, never call setTaskDecorator twice");
			}
		}
		assertNoViolations("Undecorated worker pool introduced", violations);
	}

	/**
	 * Non-vacuity: a detector that finds nothing satisfies
	 * {@link #everySelfConfiguredWorkerPoolCarriesTheSubmittersContext} trivially, which is exactly how
	 * an earlier prose rule stayed "green" while the pool it forbade shipped anyway.
	 */
	@Test
	void theDetectorFindsAnUndecoratedFixturePool() {
		JavaClasses fixtures = fixtureClasses(WORKER_FIXTURES);

		assertThat(workerPools(fixtures))
				.containsExactly("ai.riviera.workercontextfixture.UndecoratedWorkerPool");
		assertThat(carriesTheSubmittersContext(fixtures.get("ai.riviera.workercontextfixture.UndecoratedWorkerPool")))
				.as("the fixture must read as UNdecorated, or this rule proves nothing about the real pools")
				.isFalse();
	}

	/** Fully qualified names of every class that configures a {@code ThreadPoolTaskExecutor}. */
	private static Set<String> workerPools(JavaClasses classes) {
		Set<String> pools = new TreeSet<>();
		for (JavaClass type : classes) {
			for (JavaMethodCall call : type.getMethodCallsFromSelf()) {
				if (WORKER_POOL_TYPE.equals(call.getTargetOwner().getName())) {
					pools.add(type.getName());
				}
			}
		}
		return pools;
	}

	private static boolean carriesTheSubmittersContext(JavaClass pool) {
		return pool.getDirectDependenciesFromSelf().stream()
				.anyMatch(dependency ->
						MdcTaskDecorator.class.getName().equals(dependency.getTargetClass().getName()));
	}
}
