package ai.riviera.authplacementfixture.inboundexemption.api;

import org.springframework.security.core.Authentication;

/** A published surface: not exempt, so the rule must report it. */
public class PrincipalReachingPort {

	Authentication principal;
}
