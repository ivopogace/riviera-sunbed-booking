package ai.riviera.platform;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaMethod;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * The two fitness functions here — one per instrument, because the finding had two
 * independent halves and each can regress on its own.
 *
 * <p><strong>Why a rule and not just a value.</strong> The finding was never that someone chose a
 * bad pool size; it is that nobody chose one at all. {@code spring.task.scheduling.pool.size} was
 * unset, Boot's default is <strong>1</strong>, and four {@code @Scheduled} jobs quietly shared it —
 * so one wedged query stalled all four, the most consequential victim being the abandoned-payment
 * sweep, whose silence leaves {@code set_availability} claims unreleased with no alarm (the alarm,
 * {@code MoneyPathAlertCheck}, being stalled on the same thread). A committed number fixes today
 * and rots tomorrow: the fifth scheduled job would re-share a thread and nothing would say so. The
 * rule below is the number's reason, encoded — <em>every scheduled job must have a thread available
 * to it</em> — so adding a job without raising the pool fails the build instead of silently
 * recreating the finding.
 *
 * <p><strong>The non-vacuity guard is load-bearing</strong> (the {@code MailListenerExecutorArchitectureTest}
 * idiom): a scan that silently found <em>zero</em> {@code @Scheduled} methods would satisfy
 * "pool size ≥ job count" trivially and pass green forever. Naming today's four means a broken scan
 * fails loudly. Adding a fifth job is therefore a two-line edit here — deliberately: the point is
 * that a human decides the pool can carry it.
 *
 * <p><strong>The second rule is the one that protects invariant #2.</strong> The instrument this
 * slice did <em>not</em> reach for is {@code spring.jdbc.template.query-timeout}: it bounds every
 * statement in the application, including the {@code INSERT … ON CONFLICT (set_id, booking_date)}
 * whose loser waits on the winner's index tuple lock — the serialization point of the platform's
 * single most important correctness guarantee. Bounding it would turn a legitimate contention wait
 * into an abort, i.e. trade a flaky guarantee for a scheduler fix. That argument used to live only
 * in a Javadoc; a Javadoc does not fail a build, and the property is one line away at all times. This
 * rule is that argument made mechanical.
 *
 * <p>Both rules read the <em>committed</em> configuration, which is the thing under review; an
 * environment may still override either at deploy time. The second walks {@code src/main/resources}
 * as text rather than parsing it, so it catches the key in any file shape — skipping comment lines,
 * because forbidding the key must not forbid explaining why it is forbidden — with the one caveat
 * that a future YAML tree would nest the key across lines and would need this literal taught about it.
 */
class ScheduledWorkArchitectureTest {

	private static final Path MAIN_RESOURCES = Path.of("src/main/resources");
	private static final String POOL_SIZE_PROPERTY = "spring.task.scheduling.pool.size";
	private static final String GLOBAL_QUERY_TIMEOUT_PROPERTY = "spring.jdbc.template.query-timeout";

	/**
	 * Today's scheduled jobs. Extending this set is the deliberate cost of adding a fifth job —
	 * it is the moment someone confirms the pool can carry it.
	 */
	private static final Set<String> KNOWN_SCHEDULED_JOBS = Set.of(
			"AbandonedBookingScheduler#sweep",
			"GuestContactRetentionScheduler#sweep",
			"MoneyPathAlertCheck#check",
			"RequestSweepScheduler#sweep");

	@Test
	void everyScheduledJobHasAThreadOfItsOwn() {
		Set<String> jobs = scheduledJobs();

		assertThat(jobs)
				.as("non-vacuity: a scan finding nothing would satisfy the rule below trivially")
				.containsExactlyInAnyOrderElementsOf(new TreeSet<>(KNOWN_SCHEDULED_JOBS));

		String configured = mainApplicationProperties().getProperty(POOL_SIZE_PROPERTY);
		assertThat(configured)
				.as("%s is unset, so Spring Boot's default of 1 thread carries all %d scheduled jobs"
						+ " — one wedged query stalls every sweep (#395)", POOL_SIZE_PROPERTY, jobs.size())
				.isNotNull();

		assertThat(Integer.parseInt(configured.trim()))
				.as("%s must cover every @Scheduled job (%s), so no job's schedule can be delayed by"
						+ " a sibling that is stuck", POOL_SIZE_PROPERTY, jobs)
				.isGreaterThanOrEqualTo(jobs.size());
	}

	@Test
	void noGlobalQueryTimeoutIsIntroduced() {
		List<String> violations = new ArrayList<>();
		try (Stream<Path> files = Files.walk(MAIN_RESOURCES)) {
			files.filter(Files::isRegularFile)
					.filter(file -> setsGlobalQueryTimeout(readText(file)))
					.forEach(file -> violations.add(file + " sets " + GLOBAL_QUERY_TIMEOUT_PROPERTY
							+ " — it would also bound availability's claim (invariant #2);"
							+ " bound the specific client instead, as #386/#395 do"));
		}
		catch (IOException e) {
			throw new UncheckedIOException("could not walk " + MAIN_RESOURCES, e);
		}
		assertNoViolations("Global JDBC query timeout introduced", violations);
	}

	/**
	 * Comment lines are excluded on purpose: the rule forbids <em>setting</em> the property, not
	 * naming it. The two comments that explain why it is forbidden — the one beside the pool size
	 * here, and {@code JdbcEmailSuppressions#boundedClient}'s — are the argument, and a rule that
	 * fired on its own rationale would teach the next author to stop writing it down. (It did fire
	 * on exactly that during this slice, which is how the distinction earned a method.)
	 */
	private static boolean setsGlobalQueryTimeout(String content) {
		return content.lines()
				.map(String::stripLeading)
				.filter(line -> !line.startsWith("#") && !line.startsWith("!"))
				.anyMatch(line -> line.contains(GLOBAL_QUERY_TIMEOUT_PROPERTY));
	}

	/** {@code SimpleName#method} for every {@code @Scheduled} method in production code. */
	private static Set<String> scheduledJobs() {
		Set<String> jobs = new TreeSet<>();
		for (JavaClass type : PRODUCTION_CLASSES) {
			for (JavaMethod method : type.getMethods()) {
				if (method.isAnnotatedWith(Scheduled.class)) {
					jobs.add(type.getSimpleName() + "#" + method.getName());
				}
			}
		}
		return jobs;
	}

	private static Properties mainApplicationProperties() {
		Properties properties = new Properties();
		try (InputStream in = Files.newInputStream(MAIN_RESOURCES.resolve("application.properties"))) {
			properties.load(in);
		}
		catch (IOException e) {
			throw new UncheckedIOException("could not read the main application.properties", e);
		}
		return properties;
	}

	private static String readText(Path file) {
		try {
			return Files.readString(file, StandardCharsets.ISO_8859_1);
		}
		catch (IOException e) {
			throw new UncheckedIOException("could not read " + file, e);
		}
	}
}
