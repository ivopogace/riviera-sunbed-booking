package ai.riviera.domainpurityfixture.springy.domain;

import org.springframework.stereotype.Component;

/** Impure: a domain rule that needs a container to exist. */
@Component
public class SpringAnnotatedRule {

	public boolean alwaysTrue() {
		return true;
	}
}
