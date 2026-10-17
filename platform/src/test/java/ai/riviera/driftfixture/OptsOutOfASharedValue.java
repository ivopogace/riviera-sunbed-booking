package ai.riviera.driftfixture;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/** Control fixture for {@code TestContextDriftArchitectureTests}: declares a shared key at another value. */
@SpringBootTest(properties = "booking.no-show.enabled=true")
@TestPropertySource(properties = "booking.request.initial-delay=PT30M")
public class OptsOutOfASharedValue {
}
