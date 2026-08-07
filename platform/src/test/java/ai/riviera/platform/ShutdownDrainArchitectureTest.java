package ai.riviera.platform;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import ai.riviera.platform.shared.ShutdownBudget;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethodCall;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.fixtureClasses;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * The platform-wide guard on shutdown drain: every pool that spends the SIGTERM grace must be
 * accounted for, and their claims must sum inside it. Pools that drain on shutdown are separate
 * beans and {@code destroySingletons()} runs their {@code destroy()} methods <em>sequentially on one
 * thread</em>, so their windows <strong>add rather than overlap</strong>. The budget arithmetic is
 * {@code shared}'s {@code ShutdownBudget}; rationale: RESPONSIBILITIES.md §`shared`.
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
	 * The one marker that actually creates a window, as opposed to merely implying a pool wants one:
	 * {@code ExecutorConfigurationSupport.awaitTerminationIfNecessary} waits only while
	 * {@code awaitTerminationMillis > 0}, so this call is one-to-one with a share of the grace being
	 * spent. Counting <em>these call sites</em> rather than the classes around them is what makes
	 * {@link #everyDrainingPoolDeclaresExactlyOneWindow} able to see a second pool inside a class that
	 * already declares a claim.
	 */
	private static final String DRAIN_WINDOW_MARKER = "setAwaitTerminationMillis";

	/**
	 * Spring's executor package. Matching the owner by package rather than by
	 * {@code isAssignableTo(ThreadPoolTaskExecutor.class)} keeps the rule independent of whether
	 * ArchUnit resolved the Spring type hierarchy, which it need not have for a type outside the
	 * imported packages — a resolution failure would silently empty the scan.
	 */
	private static final String SPRING_EXECUTOR_PACKAGE = "org.springframework.scheduling.concurrent.";

	/**
	 * Today's draining pools, <strong>fully qualified</strong>. Extending this set is the deliberate cost
	 * of adding a fourth: it is the moment someone confirms the grace can carry it and declares its claim
	 * in {@code ShutdownBudget}.
	 *
	 * <p><strong>Fully qualified, not simple, and that is load-bearing.</strong> These names are the keys
	 * of a {@code Set}/{@code Map}, so two classes sharing a simple name would collapse into one entry —
	 * and every module here has its own {@code adapter.in} package, which is exactly where a similarly
	 * named {@code *ExecutorConfig} would land. The discovered set would still equal this one and the
	 * fourth pool's claim would go uncounted, leaving the guard green while the drain overran: the same
	 * silently-under-counting failure this class exists to end, reintroduced through its own key.
	 */
	private static final Set<String> KNOWN_DRAINING_POOLS = Set.of(
			"ai.riviera.platform.notification.application.AsyncMailDispatcher",
			"ai.riviera.platform.notification.adapter.in.RegistryMailExecutorConfig",
			"ai.riviera.platform.booking.adapter.in.RefundExecutorConfig");

	/**
	 * One claim per pool above, keyed identically so the two cannot drift — a pool added to the known set
	 * without a claim, or a claim left behind by a deleted pool, fails
	 * {@link #everyDiscoveredPoolDeclaresAClaim} rather than quietly mis-stating the budget.
	 */
	private static final Map<String, Integer> CLAIMS = Map.of(
			"ai.riviera.platform.notification.application.AsyncMailDispatcher",
			ShutdownBudget.MAIL_POOL_CLAIM_MS,
			"ai.riviera.platform.notification.adapter.in.RegistryMailExecutorConfig",
			ShutdownBudget.MAIL_POOL_CLAIM_MS,
			"ai.riviera.platform.booking.adapter.in.RefundExecutorConfig",
			ShutdownBudget.REFUND_POOL_CLAIM_MS);

	private static final Path MAIN_RESOURCES = Path.of("src/main/resources");

	/** The deliberately mis-shaped tree the detector's own proofs run against. */
	private static final String DRAIN_FIXTURES = "ai.riviera.drainfixture";

	/**
	 * The Boot-configured pools that can be made to drain by property alone. Neither has a
	 * {@code ThreadPoolTaskExecutor} call site in this codebase, so the bytecode scan structurally
	 * cannot see them — this is the one discovery hole it has, closed the way
	 * {@code ScheduledWorkArchitectureTest} closes its own property rule.
	 */
	private static final Set<String> BOOT_POOL_DRAIN_PROPERTIES = Set.of(
			"spring.task.scheduling.shutdown.await-termination",
			"spring.task.execution.shutdown.await-termination");

	@Test
	void everyDrainingPoolIsAccountedFor() {
		assertThat(drainingPools(PRODUCTION_CLASSES))
				.as("a pool that drains on shutdown spends the platform's SIGTERM grace, and the windows"
						+ " ADD rather than overlap — account for it here and declare its claim")
				.containsExactlyInAnyOrderElementsOf(new TreeSet<>(KNOWN_DRAINING_POOLS));
	}

	@Test
	void theDetectorFindsAnOversizedFixturePool() {
		assertThat(drainingPools(fixtureClasses(DRAIN_FIXTURES)))
				.as("non-vacuity: a detector that finds nothing satisfies every rule built on it"
						+ " trivially, which is precisely how the guard this replaces stayed green")
				.containsExactly("ai.riviera.drainfixture.OversizedDrainingPool");
	}

	/**
	 * The proof that counting windows sees what counting classes cannot. The fixture
	 * declares <strong>two</strong> pools in <strong>one</strong> class, so the class-keyed view reports a
	 * single entry — one claim's worth — while the window count reports two. Without this, counting
	 * windows would be an untested assertion about an untested assertion.
	 */
	@Test
	void countingWindowsSeesASecondPoolThatCountingClassesCannot() {
		JavaClasses fixtures = fixtureClasses(DRAIN_FIXTURES);

		assertThat(drainingPools(fixtures)).as("one class").hasSize(1);
		assertThat(drainWindows(fixtures))
				.as("two windows in that one class — the share of the grace a per-class claim misses")
				.isEqualTo(2);
	}

	/**
	 * The hole a per-class key cannot close on its own: <strong>one class configuring two pools.</strong>
	 * {@link #KNOWN_DRAINING_POOLS} and {@link #CLAIMS} carry one entry per class, so a second
	 * {@code @Bean} with its own {@code awaitTerminationMillis} inside an already-declared class would
	 * add a real sequential drain window that no claim covers — and the discovered set, the claim
	 * linkage and the sum would all stay green, because nothing about the class changed. Counting the
	 * windows themselves is the only assertion that sees it.
	 */
	@Test
	void everyDrainingPoolDeclaresExactlyOneWindow() {
		assertThat(drainWindows(PRODUCTION_CLASSES))
				.as("claims are declared per CLASS, so a class configuring a SECOND pool would spend a"
						+ " share of the grace that no claim covers, with every other rule here green")
				.isEqualTo(KNOWN_DRAINING_POOLS.size());
	}

	@Test
	void everyDiscoveredPoolDeclaresAClaim() {
		assertThat(CLAIMS.keySet())
				.as("a pool with no declared claim is a pool the budget below silently under-counts")
				.containsExactlyInAnyOrderElementsOf(KNOWN_DRAINING_POOLS);
	}

	@Test
	void theCombinedDrainFitsThePlatformGrace() {
		assertThat(ShutdownBudget.fits(CLAIMS.values()))
				.as("the pools drain SEQUENTIALLY, so windows that each fit alone can still overrun the"
						+ " grace together — %dms claimed of %dms",
						ShutdownBudget.claimed(CLAIMS.values()), ShutdownBudget.SIGTERM_GRACE_MS)
				.isTrue();
	}

	/**
	 * Reads the <em>committed</em> configuration, which is the thing under review; an environment may
	 * still set either key at deploy time. Comment lines are skipped for
	 * {@code ScheduledWorkArchitectureTest}'s reason — forbidding a key must not forbid explaining why
	 * it is forbidden.
	 */
	@Test
	void noBootPoolIsMadeToDrainWithoutAClaim() {
		List<String> violations = new ArrayList<>();
		try (Stream<Path> files = Files.walk(MAIN_RESOURCES)) {
			files.filter(Files::isRegularFile)
					.forEach(file -> BOOT_POOL_DRAIN_PROPERTIES.stream()
							.filter(property -> setsProperty(readText(file), property))
							.forEach(property -> violations.add(file + " sets " + property
									+ " — that makes a Boot-managed pool drain on shutdown, spending the"
									+ " platform's SIGTERM grace alongside the "
									+ KNOWN_DRAINING_POOLS.size() + " pools already claiming it."
									+ " Declare its claim in ShutdownBudget first")));
		}
		catch (IOException e) {
			throw new UncheckedIOException("could not walk " + MAIN_RESOURCES, e);
		}
		assertNoViolations("Undeclared shutdown drain introduced", violations);
	}

	private static boolean setsProperty(String content, String property) {
		return content.lines()
				.map(String::stripLeading)
				.filter(line -> !line.startsWith("#") && !line.startsWith("!"))
				.anyMatch(line -> line.contains(property));
	}

	private static String readText(Path file) {
		try {
			return Files.readString(file, StandardCharsets.ISO_8859_1);
		}
		catch (IOException e) {
			throw new UncheckedIOException("could not read " + file, e);
		}
	}

	/** Fully qualified names of every class configuring a pool that drains on shutdown. */
	private static Set<String> drainingPools(JavaClasses classes) {
		Set<String> pools = new TreeSet<>();
		for (JavaClass type : classes) {
			for (JavaMethodCall call : type.getMethodCallsFromSelf()) {
				if (isDrainMarker(call)) {
					pools.add(type.getName());
				}
			}
		}
		return pools;
	}

	/**
	 * How many drain windows production code opens, counted as {@link #DRAIN_WINDOW_MARKER} call sites
	 * rather than as classes. ArchUnit's accesses carry their line number, so two calls in one class are
	 * two entries — which is the whole point.
	 */
	private static int drainWindows(JavaClasses classes) {
		int windows = 0;
		for (JavaClass type : classes) {
			for (JavaMethodCall call : type.getMethodCallsFromSelf()) {
				if (DRAIN_WINDOW_MARKER.equals(call.getTarget().getName()) && onSpringExecutor(call)) {
					windows++;
				}
			}
		}
		return windows;
	}

	private static boolean isDrainMarker(JavaMethodCall call) {
		return DRAIN_MARKERS.contains(call.getTarget().getName()) && onSpringExecutor(call);
	}

	private static boolean onSpringExecutor(JavaMethodCall call) {
		return call.getTargetOwner().getName().startsWith(SPRING_EXECUTOR_PACKAGE);
	}
}
