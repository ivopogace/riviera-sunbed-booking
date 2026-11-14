package ai.riviera.platform.notification.adapter.in;

import java.net.URI;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import ai.riviera.platform.notification.adapter.in.SupportContactConfig.SupportContactProperties;
import ai.riviera.platform.notification.application.SupportContact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class SupportContactPropertiesTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withUserConfiguration(SupportContactConfig.class);

	@Test
	void theShippedConfigurationCarriesNoChannelSoNothingShowsAPlaceholder() {
		runner.run(context -> assertThat(context.getBean(SupportContact.class).hasChannel()).isFalse());
	}

	@Test
	void theEnvironmentConfiguresBothChannels() {
		runner.withSystemProperties("RIVIERA_SUPPORT_EMAIL=help@example.com",
				"RIVIERA_SUPPORT_WHATSAPP=+355 69 123-4567").run(context -> {
					SupportContact contact = context.getBean(SupportContact.class);
					assertThat(contact.email()).contains("help@example.com");
					assertThat(contact.whatsappLink()).contains(URI.create("https://wa.me/355691234567"));
				});
	}

	@Test
	void blankValuesBindToAbsent() {
		SupportContactProperties properties = new SupportContactProperties("  ", "");

		assertThat(properties.email()).isNull();
		assertThat(properties.whatsapp()).isNull();
	}

	@Test
	void aMalformedMailboxFailsTheContextNamingTheKeyNotTheValue() {
		runner.withPropertyValues("riviera.notification.support.email=not-an-address")
				.run(context -> assertThat(context)
						.hasFailed()
						.getFailure()
						.rootCause()
						.isInstanceOf(IllegalArgumentException.class)
						.hasMessageContaining("riviera.notification.support.email")
						.hasMessageNotContaining("not-an-address"));
	}

	@Test
	void aNumberWithoutACountryCodeIsRejected() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new SupportContactProperties(null, "069 123 4567"))
				.withMessageContaining("riviera.notification.support.whatsapp")
				.withMessageNotContaining("069");
		assertThatIllegalArgumentException().isThrownBy(() -> new SupportContactProperties(null, "+355abc12345"));
		assertThatIllegalArgumentException().isThrownBy(() -> new SupportContactProperties(null, "+1234567"));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new SupportContactProperties(null, "+1234567890123456"));
	}

	@Test
	void aNumberKeepsOnlyItsDigits() {
		assertThat(Optional.ofNullable(new SupportContactProperties(null, "+355.69.123.4567").whatsapp()))
				.contains("355691234567");
	}
}
