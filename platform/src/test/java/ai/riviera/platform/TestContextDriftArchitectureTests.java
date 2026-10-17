package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Every distinct {@code @SpringBootTest} property set is a Spring context of its own, and with the Postgres
 * container context-scoped, a container and a Flyway run too (#1599). A test class that restates a
 * {@link SharedTestProperties} key at the shared value therefore buys nothing and costs a context; it
 * declares one of those keys only to opt out of it. The rule is proven against the fixture tree under
 * {@code ai.riviera.driftfixture}, never by breaking a real test class.
 */
class TestContextDriftArchitectureTests {

	private static final String FIXTURE_BASE = "ai.riviera.driftfixture";

	private static final JavaClasses TEST_CLASSES = new ClassFileImporter()
			.withImportOption(ImportOption.Predefined.ONLY_INCLUDE_TESTS)
			.importPackages(ArchitectureTestSupport.PRODUCTION_BASE);

	@Test
	void noTestRestatesASharedPropertyAtItsSharedValue() {
		Scan scan = scan(TEST_CLASSES);

		assertTrue(scan.declaring() > 0, "No test class declaring properties was found — the rule would be vacuously green.");
		assertTrue(scan.violations().isEmpty(), () -> "Shared test property restated:\n  " + String.join("\n  ", scan.violations()));
	}

	@Test
	void aRestatedSharedValueIsRejectedAndAnOptOutIsNot() {
		Scan scan = scan(ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE));

		assertEquals(2, scan.declaring(), "both fixture classes declare properties");
		assertEquals(List.of(
				"ai.riviera.driftfixture.RestatesASharedValue restates booking.no-show.enabled=false"
						+ " (SharedTestProperties already sets it)",
				"ai.riviera.driftfixture.RestatesASharedValue restates booking.request.initial-delay=PT2H"
						+ " (SharedTestProperties already sets it)"),
				scan.violations(), "one violation per restated entry, from either annotation, and none for the opt-out");
	}

	private record Scan(int declaring, List<String> violations) {
	}

	private static Scan scan(JavaClasses classes) {
		List<String> violations = new ArrayList<>();
		int declaring = 0;
		for (JavaClass type : classes) {
			List<String> declared = declaredProperties(type);
			if (declared.isEmpty()) {
				continue;
			}
			declaring++;
			for (String entry : declared) {
				int eq = entry.indexOf('=');
				String key = eq < 0 ? entry : entry.substring(0, eq).strip();
				Object shared = SharedTestProperties.VALUES.get(key);
				if (shared != null && eq >= 0 && shared.equals(entry.substring(eq + 1).strip())) {
					violations.add(type.getName() + " restates " + entry + " (SharedTestProperties already sets it)");
				}
			}
		}
		return new Scan(declaring, violations);
	}

	private static List<String> declaredProperties(JavaClass type) {
		Stream<String> springBootTest = type.isAnnotatedWith(SpringBootTest.class)
				? Stream.of(type.getAnnotationOfType(SpringBootTest.class).properties())
				: Stream.empty();
		Stream<String> testPropertySource = type.isAnnotatedWith(TestPropertySource.class)
				? Stream.of(type.getAnnotationOfType(TestPropertySource.class).properties())
				: Stream.empty();
		return Stream.concat(springBootTest, testPropertySource).toList();
	}
}
