package ai.riviera.platform;

import java.util.Arrays;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Issue #100 (D4), AC-2: when the native Boot 4 structured console format is enabled
 * ({@code logging.structured.format.console=ecs} — the ONE env var production flips), a log line is
 * emitted as JSON and carries the {@link CorrelationIdFilter#MDC_KEY} MDC field, so a correlation id
 * surfaces on every line. Booted on a MINIMAL {@code @SpringBootConfiguration} with no
 * {@code @EnableAutoConfiguration} — the logging system is initialised by a SpringApplication
 * listener, not an autoconfiguration — so there is no web server and no DataSource (no Docker).
 */
@SpringBootTest(classes = StructuredLoggingIT.Boot.class,
		webEnvironment = SpringBootTest.WebEnvironment.NONE,
		properties = "logging.structured.format.console=ecs")
@ExtendWith(OutputCaptureExtension.class)
class StructuredLoggingIT {

	private static final Logger log = LoggerFactory.getLogger(StructuredLoggingIT.class);
	private static final String PROBE_MESSAGE = "structured-logging-probe-line";
	private static final String PROBE_ID = "corr-probe-1234";

	@SpringBootConfiguration
	static class Boot {
	}

	@AfterEach
	void clearMdc() {
		MDC.clear();
	}

	@Test
	void emitsJsonLinesCarryingTheCorrelationIdMdcField(CapturedOutput output) {
		MDC.put(CorrelationIdFilter.MDC_KEY, PROBE_ID);
		log.info(PROBE_MESSAGE);

		Optional<String> probeLine = Arrays.stream(output.getOut().split("\\R"))
				.filter(line -> line.contains(PROBE_MESSAGE))
				.findFirst();

		assertTrue(probeLine.isPresent(), () -> "no log line contained the probe message; output was:\n" + output.getOut());
		String line = probeLine.get();
		assertTrue(line.stripLeading().startsWith("{"), () -> "log line is not JSON: " + line);
		assertTrue(line.contains("\"" + CorrelationIdFilter.MDC_KEY + "\""),
				() -> "JSON line is missing the correlationId field: " + line);
		assertTrue(line.contains(PROBE_ID), () -> "JSON line is missing the correlation id value: " + line);
	}
}
