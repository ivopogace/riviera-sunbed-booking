package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Every distinct {@code @SpringBootTest} property set is a Spring context of its own, and with the Postgres
 * container context-scoped, a container and a Flyway run too (#1599). A test class that restates a
 * {@link SharedTestProperties} key at the shared value therefore buys nothing and costs a context; it
 * declares one of those keys only to opt out of it.
 */
class TestContextDriftArchitectureTests {

	private static final JavaClasses TEST_CLASSES = new ClassFileImporter()
			.withImportOption(ImportOption.Predefined.ONLY_INCLUDE_TESTS)
			.importPackages(ArchitectureTestSupport.PRODUCTION_BASE);

	@Test
	void noTestRestatesASharedPropertyAtItsSharedValue() {
		List<String> violations = new ArrayList<>();
		int declaring = 0;
		for (JavaClass type : TEST_CLASSES) {
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
		assertTrue(declaring > 0, "No test class declaring properties was found — the rule would be vacuously green.");
		assertTrue(violations.isEmpty(), () -> "Shared test property restated:\n  " + String.join("\n  ", violations));
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

	/** Keeps {@link SharedTestProperties#VALUES} the type the rule reads. */
	@SuppressWarnings("unused")
	private static final Map<String, Object> SHARED = SharedTestProperties.VALUES;
}
