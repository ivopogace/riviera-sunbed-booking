package ai.riviera.authplacementfixture.inboundexemption.adapter.out;

import org.springframework.security.core.Authentication;

/** A sibling adapter package: not exempt, so the rule must report it. */
public class PrincipalReachingAdapter {

	Authentication principal;
}
