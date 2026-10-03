package ai.riviera.platform;

import java.util.List;
import java.util.stream.Stream;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.syntax.elements.GivenClassesConjunction;

import static ai.riviera.platform.ArchitectureTestSupport.fixtureClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The one rule behind the {@code *AuthPlacementTests} (RV-BE-11, {@code RESPONSIBILITIES.md} §Platform edge):
 * login and session machinery lives in {@code auth}, mail transport in {@code notification}, so a module names
 * no type from the families it is checked for — over the whole module, or outside its {@code adapter.in}, where
 * a controller may read the signed-in principal. OIDC/OAuth2 client types fall under
 * {@code org.springframework.security..}; SSO is hand-rolled in {@code auth}, so no other OIDC library resolves.
 */
final class AuthPlacementRule {

	/** Spring Security and Spring Session. */
	static final List<String> LOGIN_AND_SESSION_PACKAGES = List.of(
			"org.springframework.security..",
			"org.springframework.session..");

	/** Mail: Spring's abstraction, the Jakarta Mail API, its Angus provider. */
	static final List<String> MAIL_PACKAGES = List.of(
			"org.springframework.mail..",
			"jakarta.mail..",
			"org.eclipse.angus.mail..");

	/** Every banned family. */
	static final List<String> BANNED_PACKAGES = Stream.concat(LOGIN_AND_SESSION_PACKAGES.stream(),
			MAIL_PACKAGES.stream()).toList();

	static final String FIXTURE_BASE = "ai.riviera.authplacementfixture";

	private static final String INBOUND_ADAPTER = ".adapter.in..";

	private AuthPlacementRule() {
	}

	/** Every banned family, anywhere in {@code module}, its inbound adapter included. */
	static ArchRule noLoginMachineryIn(String basePackage, String module) {
		return rule(noClasses().that().resideInAPackage(basePackage + "." + module + ".."), module, BANNED_PACKAGES,
				"anywhere");
	}

	/** {@code families}, anywhere in {@code module} but its {@code adapter.in}. */
	static ArchRule noLoginMachineryOutsideInboundAdapter(String basePackage, String module, List<String> families) {
		return rule(noClasses().that().resideInAPackage(basePackage + "." + module + "..")
				.and().resideOutsideOfPackage(basePackage + "." + module + INBOUND_ADAPTER),
				module, families, "outside its inbound adapter, which may read the signed-in principal");
	}

	private static ArchRule rule(GivenClassesConjunction classes, String module, List<String> families,
			String where) {
		return classes.should().dependOnClassesThat().resideInAnyPackage(families.toArray(String[]::new))
				.because("login, sessions and mail transport are edge concerns (RV-BE-11): `auth` owns login and "
						+ "sessions, `notification` mail transport, so the " + module + " module names none of "
						+ families + " " + where + ".");
	}

	/** {@link #assertRejects} for {@link #noLoginMachineryIn}. */
	static void assertRejectsEveryBannedPackage(String module) {
		assertRejects(module, noLoginMachineryIn(FIXTURE_BASE, module), BANNED_PACKAGES);
	}

	/** {@link #assertRejects} for {@link #noLoginMachineryOutsideInboundAdapter}. */
	static void assertRejectsEveryCheckedPackageOutsideInboundAdapter(String module, List<String> families) {
		assertRejects(module, noLoginMachineryOutsideInboundAdapter(FIXTURE_BASE, module, families), families);
	}

	/**
	 * Proves {@code rule} over {@code <FIXTURE_BASE>.<module>}: every field type of {@code LoginMachineryInModule}
	 * is reported (a narrowed list fails), every entry of {@code families} catches one (a dead entry fails), and
	 * no other class is (the control {@code OpaqueCredentialHash}, an exempt reader, a family not checked here).
	 */
	private static void assertRejects(String module, ArchRule rule, List<String> families) {
		String fixturePackage = FIXTURE_BASE + "." + module;
		String machinery = fixturePackage + ".LoginMachineryInModule";
		JavaClasses fixtures = fixtureClasses(fixturePackage);
		List<String> violations = rule.evaluate(fixtures).getFailureReport().getDetails();

		List<String> unreported = fixtures.get(machinery).getFields().stream()
				.map(field -> "<" + field.getRawType().getName() + ">")
				.filter(type -> violations.stream().noneMatch(v -> v.contains(type)))
				.toList();
		assertTrue(unreported.isEmpty(), "Expected the " + module + " placement rule to reject a dependency on "
				+ unreported + ", but got: " + violations);

		List<String> dead = families.stream()
				.map(banned -> "<" + banned.substring(0, banned.length() - "..".length()) + ".")
				.filter(prefix -> violations.stream().noneMatch(v -> v.contains(prefix)))
				.toList();
		assertTrue(dead.isEmpty(), "Checked packages with no fixture violation in LoginMachineryInModule: " + dead);
		fixtures.get(fixturePackage + ".OpaqueCredentialHash");
		List<String> strays = violations.stream().filter(v -> !v.contains("<" + machinery + ".")).toList();
		assertTrue(strays.isEmpty(), "Only LoginMachineryInModule names a checked type, yet: " + strays);
	}
}
