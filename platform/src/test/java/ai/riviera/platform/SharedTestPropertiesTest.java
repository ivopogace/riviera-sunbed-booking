package ai.riviera.platform;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * {@link SharedTestProperties} wins over {@code application.properties} (which ships the no-show sweep on)
 * and loses to a class's own {@code @SpringBootTest(properties)}. A bare configuration class, so the
 * context is the property sources alone.
 */
@SpringBootTest(classes = SharedTestPropertiesTest.Bare.class)
class SharedTestPropertiesTest {

	@Configuration(proxyBeanMethods = false)
	static class Bare {
	}

	@Autowired
	Environment environment;

	@Test
	void everySharedValueOverridesTheApplicationConfiguration() {
		SharedTestProperties.VALUES.forEach((key, value) -> assertEquals(value, environment.getProperty(key), key));
	}

	@Nested
	@SpringBootTest(classes = Bare.class, properties = "booking.no-show.enabled=true")
	class OptingBackIn {

		@Autowired
		Environment environment;

		@Test
		void aClassDeclaringTheKeyWins() {
			assertEquals("true", environment.getProperty("booking.no-show.enabled"));
			assertEquals("PT2H", environment.getProperty("booking.request.initial-delay"), "the rest still apply");
		}
	}
}
