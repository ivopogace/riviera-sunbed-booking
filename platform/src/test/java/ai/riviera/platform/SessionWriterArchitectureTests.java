package ai.riviera.platform;

import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;
import org.springframework.security.web.context.SecurityContextRepository;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static com.tngtech.archunit.core.domain.JavaCall.Predicates.target;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.properties.HasName.Predicates.name;
import static com.tngtech.archunit.core.domain.properties.HasOwner.Predicates.With.owner;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code auth}'s {@code SessionAuthentication} is the only code that saves a security context through any
 * {@link SecurityContextRepository}, so every stored session principal is a stamped {@code SessionPrincipal} and
 * {@link SessionCredentialFilter} checks it (#1306).
 */
class SessionWriterArchitectureTests {

	private static final String FIXTURE_BASE = "ai.riviera.sessionwriterfixture";

	/** By name: the writer is package-private in {@code auth.adapter.in}. A rename fails the rule on the writer itself. */
	private static final String SESSION_WRITER = "ai.riviera.platform.auth.adapter.in.SessionAuthentication";

	@Test
	void onlySessionAuthenticationSavesASecurityContext() {
		onlySessionAuthenticationWrites().check(PRODUCTION_CLASSES);
	}

	@Test
	void aWriteTypedOnAConcreteRepositoryIsCaught() {
		String violations = onlySessionAuthenticationWrites()
				.evaluate(ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE)).getFailureReport().toString();

		assertTrue(violations.contains("StraySessionWriter"), "expected the fixture's write to be caught: " + violations);
	}

	private static ArchRule onlySessionAuthenticationWrites() {
		return noClasses()
				.that().doNotHaveFullyQualifiedName(SESSION_WRITER)
				.should().callMethodWhere(target(name("saveContext"))
						.and(target(owner(assignableTo(SecurityContextRepository.class)))))
				.because("a session principal must carry a credential stamp (#1306); SessionAuthentication "
						+ "refuses any other principal");
	}
}
