package ai.riviera.platform.auth.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The scrape-token hashes (ADR-0032): unset by default, so the scrape fails closed; a value that is not a SHA-256
 * in hex fails the boot naming its key without echoing the value; case and surrounding whitespace are forgiven.
 */
class ScrapeTokenPropertiesBindingTest {

	private static final String HASH = "9F86D081884C7D659A2FEAA0C55AD015A3BF4F1B2B0B822CD15D6C15B0F00A08";

	@Test
	void theShippedConfigurationSetsNoHash() {
		runner().run(context -> assertThat(context.getBean(ScrapeTokenProperties.class).acceptedHashes()).isEmpty());
	}

	@Test
	void bothSlotsBindLowerCasedAndStripped() {
		runner().withPropertyValues("riviera.observability.scrape-token-sha256= " + HASH + " ",
						"riviera.observability.scrape-token-sha256-next=" + HASH.toLowerCase())
				.run(context -> {
					ScrapeTokenProperties properties = context.getBean(ScrapeTokenProperties.class);
					assertThat(properties.scrapeTokenSha256()).isEqualTo(HASH.toLowerCase());
					assertThat(properties.scrapeTokenSha256Next()).isEqualTo(HASH.toLowerCase());
					assertThat(properties.acceptedHashes()).hasSize(2);
				});
	}

	@Test
	void aBlankSlotIsUnset() {
		runner().withPropertyValues("riviera.observability.scrape-token-sha256=",
						"riviera.observability.scrape-token-sha256-next=   ")
				.run(context -> assertThat(context.getBean(ScrapeTokenProperties.class).acceptedHashes()).isEmpty());
	}

	@ParameterizedTest
	@ValueSource(strings = { "not-a-hash", "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a0",
			"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08ff",
			"zz86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" })
	void aValueThatIsNotAHexSha256FailsTheBootWithoutEchoingIt(String value) {
		runner().withPropertyValues("riviera.observability.scrape-token-sha256-next=" + value)
				.run(context -> {
					assertThat(context).hasFailed().getFailure().rootCause()
							.isInstanceOf(IllegalArgumentException.class)
							.hasMessageContaining("riviera.observability.scrape-token-sha256-next");
					for (Throwable cause = context.getStartupFailure(); cause != null; cause = cause.getCause()) {
						assertThat(String.valueOf(cause.getMessage())).doesNotContain(value);
					}
				});
	}

	private static ApplicationContextRunner runner() {
		return new ApplicationContextRunner()
				.withInitializer(context -> context.getEnvironment().getPropertySources()
						.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME))
				.withInitializer(new ConfigDataApplicationContextInitializer())
				.withUserConfiguration(BindOnly.class);
	}

	@Configuration
	@EnableConfigurationProperties(ScrapeTokenProperties.class)
	static class BindOnly {
	}
}
