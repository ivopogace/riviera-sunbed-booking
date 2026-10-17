package ai.riviera.driftfixture;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Negative fixture for {@code TestContextDriftArchitectureTests}: restates a shared key at its shared value
 * through each annotation the rule reads; the altcha key is not shared and must stay unreported.
 */
@SpringBootTest(properties = { "riviera.altcha.enabled=false", "booking.no-show.enabled=false" })
@TestPropertySource(properties = "booking.request.initial-delay=PT2H")
public class RestatesASharedValue {
}
