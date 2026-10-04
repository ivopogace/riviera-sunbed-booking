package ai.riviera.authplacementfixture.inboundexemption.adapter.inbound;

import org.springframework.security.core.Authentication;

/** A package sharing the {@code adapter.in} prefix: not exempt, so the rule must report it. */
public class PrincipalReachingLookalike {

	Authentication principal;
}
