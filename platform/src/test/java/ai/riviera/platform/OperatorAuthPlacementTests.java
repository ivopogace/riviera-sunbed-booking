package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Guards the #74 authentication-placement boundary (RV-BE-11, {@code RESPONSIBILITIES.md}): the
 * <em>login/credential-checking machinery</em> is a platform/edge Spring Security concern and must
 * <strong>not</strong> grow inside the {@code operator} domain module. The module owns the account
 * identity and stores an <em>opaque</em> credential hash; it never imports a
 * {@code org.springframework.security.*} type (no {@code UserDetailsService}, no {@code PasswordEncoder},
 * no authentication filter). If a future change moves login into the module, this fails the build —
 * exactly the placement slip RV-BE-11 flags at review, caught earlier here.
 *
 * <p>A fast, context-free ArchUnit rule (sibling to {@link JdbcOnlyArchitectureTests} / {@link
 * ModularityTests} — no Spring context, no DB, runs anywhere).
 */
class OperatorAuthPlacementTests {

	private static final JavaClasses OPERATOR_MODULE = new ClassFileImporter()
			.withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
			.importPackages("ai.riviera.platform.operator");

	@Test
	void operatorModuleDependsOnNoSpringSecurityType() {
		ArchRule rule = noClasses()
				.should().dependOnClassesThat().resideInAnyPackage("org.springframework.security..")
				.because("authentication/login is a platform/edge concern (#74, RV-BE-11); the operator "
						+ "module stores an opaque credential hash but never encodes/verifies it, so it must "
						+ "not import any org.springframework.security type.");
		rule.check(OPERATOR_MODULE);
	}
}
