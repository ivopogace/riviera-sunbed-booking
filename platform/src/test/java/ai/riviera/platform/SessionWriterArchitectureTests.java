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

/**
 * {@link SessionAuthentication} is the only code that saves a security context through any
 * {@link SecurityContextRepository}, so every stored session principal is a stamped {@link SessionPrincipal} and
 * {@link SessionCredentialFilter} checks it (#1306).
 */
class SessionWriterArchitectureTests {

	@Test
	void onlySessionAuthenticationSavesASecurityContext() {
		ArchRule rule = noClasses()
				.that().doNotHaveFullyQualifiedName(SessionAuthentication.class.getName())
				.should().callMethodWhere(target(name("saveContext"))
						.and(target(owner(assignableTo(SecurityContextRepository.class)))))
				.because("a session principal must carry a credential stamp (#1306); SessionAuthentication "
						+ "refuses any other principal");
		rule.check(PRODUCTION_CLASSES);
	}
}
