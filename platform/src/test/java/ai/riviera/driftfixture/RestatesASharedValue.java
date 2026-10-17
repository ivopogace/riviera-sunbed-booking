package ai.riviera.driftfixture;

import org.springframework.boot.test.context.SpringBootTest;

/** Negative fixture for {@code TestContextDriftArchitectureTests}: restates a shared key at its shared value. */
@SpringBootTest(properties = { "riviera.altcha.enabled=false", "booking.no-show.enabled=false" })
public class RestatesASharedValue {
}
