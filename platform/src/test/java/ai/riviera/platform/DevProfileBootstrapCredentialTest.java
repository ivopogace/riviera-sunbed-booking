package ai.riviera.platform;

import java.io.IOException;
import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The {@code dev} profile's default bootstrap credential must clear the same floor the initializer
 * enforces, or a local stack boots with no admin login. Reads the properties file directly — no
 * Spring context, no Docker Compose.
 */
class DevProfileBootstrapCredentialTest {

	@Test
	void theDevDefaultMeetsTheFloor() throws IOException {
		Properties dev = PropertiesLoaderUtils.loadProperties(new ClassPathResource("application-dev.properties"));
		String password = dev.getProperty("riviera.operator.password");

		assertEquals(PasswordPolicy.MIN_LENGTH, password.length(), "the dev default is exactly the floor");
		assertTrue(PasswordPolicy.hasPermittedLength(password));
	}
}
