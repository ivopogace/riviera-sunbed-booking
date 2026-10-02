package ai.riviera.platform;

import java.util.List;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.ArchRule;

import static ai.riviera.platform.ArchitectureTestSupport.fixtureClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The one rule behind {@link CustomerAuthPlacementTests} and {@link OperatorAuthPlacementTests} (RV-BE-11,
 * {@code RESPONSIBILITIES.md} §Platform edge): login and session machinery lives in {@code auth}, mail
 * transport in {@code notification}, so a domain module that owns an account depends on no type from
 * {@link #BANNED_PACKAGES}. OIDC/OAuth2 client types fall under {@code org.springframework.security..};
 * SSO is hand-rolled in {@code auth}, so no other OIDC library resolves to ban.
 */
final class AuthPlacementRule {

	/** Spring Security, Spring Session, and mail: Spring's abstraction, the Jakarta Mail API, its Angus provider. */
	static final List<String> BANNED_PACKAGES = List.of(
			"org.springframework.security..",
			"org.springframework.session..",
			"org.springframework.mail..",
			"jakarta.mail..",
			"org.eclipse.angus.mail..");

	private static final String FIXTURE_BASE = "ai.riviera.authplacementfixture";

	private AuthPlacementRule() {
	}

	static ArchRule noLoginMachineryIn(String basePackage, String module) {
		return noClasses()
				.that().resideInAPackage(basePackage + "." + module + "..")
				.should().dependOnClassesThat().resideInAnyPackage(BANNED_PACKAGES.toArray(String[]::new))
				.because("login, sessions and mail transport are edge concerns (RV-BE-11): `auth` and "
						+ "`notification` own them; the " + module + " module stores an identity and an opaque "
						+ "credential hash and never encodes, verifies, establishes a session or sends mail.");
	}

	/**
	 * Proves the rule over {@code <FIXTURE_BASE>.<module>}: every field type of {@code LoginMachineryInModule}
	 * is reported (a narrowed list fails), every entry of {@link #BANNED_PACKAGES} catches one (a dead entry
	 * fails), and the control {@code OpaqueCredentialHash} stays clean.
	 */
	static void assertRejectsEveryBannedPackage(String module) {
		String fixturePackage = FIXTURE_BASE + "." + module;
		JavaClasses fixtures = fixtureClasses(fixturePackage);
		List<String> violations = noLoginMachineryIn(FIXTURE_BASE, module).evaluate(fixtures)
				.getFailureReport().getDetails();

		List<String> unreported = fixtures.get(fixturePackage + ".LoginMachineryInModule").getFields().stream()
				.map(field -> "<" + field.getRawType().getName() + ">")
				.filter(type -> violations.stream().noneMatch(v -> v.contains(type)))
				.toList();
		assertTrue(unreported.isEmpty(), "Expected the " + module + " placement rule to reject a dependency on "
				+ unreported + ", but got: " + violations);

		List<String> dead = BANNED_PACKAGES.stream()
				.map(banned -> "<" + banned.substring(0, banned.length() - "..".length()) + ".")
				.filter(prefix -> violations.stream().noneMatch(v -> v.contains(prefix)))
				.toList();
		assertTrue(dead.isEmpty(), "Banned packages with no fixture violation in LoginMachineryInModule: " + dead);
		fixtures.get(fixturePackage + ".OpaqueCredentialHash");
		assertTrue(violations.stream().noneMatch(v -> v.contains("OpaqueCredentialHash")),
				"The control fixture names no banned type, yet was reported: " + violations);
	}
}
