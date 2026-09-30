package ai.riviera.platform;

import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;
import org.springframework.security.web.context.SecurityContextRepository;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * {@link SessionAuthentication} is the only code that saves a security context into a session, so every session
 * principal is a stamped {@link SessionPrincipal} and {@link SessionCredentialFilter} checks it (#1306).
 */
class SessionWriterArchitectureTests {

	@Test
	void onlySessionAuthenticationSavesASecurityContext() {
		ArchRule rule = noClasses()
				.that().doNotHaveFullyQualifiedName(SessionAuthentication.class.getName())
				.should().callMethod(SecurityContextRepository.class, "saveContext",
						org.springframework.security.core.context.SecurityContext.class,
						jakarta.servlet.http.HttpServletRequest.class, jakarta.servlet.http.HttpServletResponse.class)
				.because("a session principal must carry a credential stamp (#1306); SessionAuthentication "
						+ "refuses any other principal");
		rule.check(PRODUCTION_CLASSES);
	}
}
