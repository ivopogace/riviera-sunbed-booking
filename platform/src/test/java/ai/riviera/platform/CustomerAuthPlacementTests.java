package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.lang.ArchRule;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Guards the S2 authentication-placement boundary (RV-BE-11, {@code RESPONSIBILITIES.md}) — the
 * customer-side sibling of {@link OperatorAuthPlacementTests}. The <em>login/credential-checking
 * machinery</em> is a platform/edge Spring Security concern and must <strong>not</strong> grow inside
 * the {@code customer} domain module. The module owns the account identity and stores an
 * <em>opaque</em> credential hash; it never imports a {@code org.springframework.security.*} type (no
 * {@code UserDetailsService}, no {@code PasswordEncoder}, no authentication filter). If a future change
 * moves login into the module, this fails the build — exactly the placement slip RV-BE-11 flags at
 * review, caught earlier here.
 *
 * <p>A fast, context-free ArchUnit rule (sibling to {@link JdbcOnlyArchitectureTests} / {@link
 * ModularityTests} — no Spring context, no DB, runs anywhere).
 */
class CustomerAuthPlacementTests {

	@Test
	void customerModuleDependsOnNoSpringSecurityType() {
		ArchRule rule = noClasses()
				.that().resideInAPackage(PRODUCTION_BASE + ".customer..")
				.should().dependOnClassesThat().resideInAnyPackage("org.springframework.security..")
				.because("authentication/login is a platform/edge concern (RV-BE-11); the customer "
						+ "module stores an opaque credential hash but never encodes/verifies it, so it must "
						+ "not import any org.springframework.security type.");
		rule.check(PRODUCTION_CLASSES);
	}
}
