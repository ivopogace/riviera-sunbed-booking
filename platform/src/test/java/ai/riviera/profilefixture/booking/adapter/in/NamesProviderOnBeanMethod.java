package ai.riviera.profilefixture.booking.adapter.in;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;

class NamesProviderOnBeanMethod {

	@Bean
	@Profile("paysera")
	Object job() {
		return new Object();
	}
}
