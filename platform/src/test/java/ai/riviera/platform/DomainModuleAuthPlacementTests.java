package ai.riviera.platform;

import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.tngtech.archunit.core.domain.JavaClasses;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.FieldSource;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static ai.riviera.platform.ArchitectureTestSupport.fixtureClasses;
import static ai.riviera.platform.ArchitectureTestSupport.moduleOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Keeps login and session machinery and mail transport out of every module but the edge, outside its
 * {@code adapter.in} (RV-BE-11, {@code RESPONSIBILITIES.md} §Platform edge), per {@link AuthPlacementRule}:
 * a controller may read the signed-in principal. {@code notification} owns mail, so only security and session
 * are checked there. {@code customer} and {@code operator} carry the whole-module rule in their own tests.
 */
class DomainModuleAuthPlacementTests {

	static final List<String> CHECKED_MODULES = List.of("availability", "booking", "payment", "payout", "review",
			"itinerary", "remodel", "venue", "notification", "challenge", "audit", "monitoring", "shared");

	private static final Set<String> WHOLE_MODULE_CHECKED = Set.of("customer", "operator");

	private static final Set<String> EDGE = Set.of("auth", "web");

	private static final String MAIL_OWNER = "notification";

	private static List<String> familiesCheckedIn(String module) {
		return MAIL_OWNER.equals(module) ? AuthPlacementRule.LOGIN_AND_SESSION_PACKAGES
				: AuthPlacementRule.BANNED_PACKAGES;
	}

	@ParameterizedTest
	@FieldSource("CHECKED_MODULES")
	void moduleDependsOnNoLoginSessionOrMailTypeOutsideItsInboundAdapter(String module) {
		AuthPlacementRule.noLoginMachineryOutsideInboundAdapter(PRODUCTION_BASE, module, familiesCheckedIn(module))
				.check(PRODUCTION_CLASSES);
	}

	@ParameterizedTest
	@FieldSource("CHECKED_MODULES")
	void everyCheckedFamilyIsRejected(String module) {
		AuthPlacementRule.assertRejectsEveryCheckedPackageOutsideInboundAdapter(module, familiesCheckedIn(module));
	}

	@Test
	void inboundAdapterIsExemptAndTheSameTypeElsewhereIsNot() {
		String module = "booking";
		String fixturePackage = AuthPlacementRule.FIXTURE_BASE + "." + module;
		JavaClasses fixtures = fixtureClasses(fixturePackage);
		fixtures.get(fixturePackage + ".adapter.in.PrincipalReadingController");
		List<String> violations = AuthPlacementRule
				.noLoginMachineryOutsideInboundAdapter(AuthPlacementRule.FIXTURE_BASE, module,
						AuthPlacementRule.BANNED_PACKAGES)
				.evaluate(fixtures).getFailureReport().getDetails();

		String authentication = "<org.springframework.security.core.Authentication>";
		assertTrue(violations.stream().anyMatch(v -> v.contains(fixturePackage + ".LoginMachineryInModule")
				&& v.contains(authentication)), "Outside adapter.in, Authentication must be reported: " + violations);
		assertTrue(violations.stream().noneMatch(v -> v.contains("PrincipalReadingController")),
				"adapter.in may read the principal, yet was reported: " + violations);
	}

	@Test
	void everyModuleIsClassified() {
		Set<String> modules = PRODUCTION_CLASSES.stream()
				.map(type -> moduleOf(type, PRODUCTION_BASE))
				.filter(Objects::nonNull)
				.collect(Collectors.toCollection(TreeSet::new));
		Set<String> classified = Stream.of(CHECKED_MODULES, WHOLE_MODULE_CHECKED, EDGE)
				.flatMap(Collection::stream)
				.collect(Collectors.toCollection(TreeSet::new));
		assertEquals(modules, classified, "Every module is auth-placement checked, whole-module checked, "
				+ "or edge; a new module joins one of the lists");
	}
}
