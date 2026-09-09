package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The two remodel windows as bound, validated configuration: defaults of 24h and 96h, each at least
 * one minute, and the notice floor strictly beyond the freeze window — a floor inside the freeze
 * would leave no move-only band and let a frozen claim read as movable. Validated in the compact
 * constructor because no JSR-303 implementation is on the classpath ({@code RequestPropertiesTest}).
 */
class RemodelPropertiesTest {

	@Test
	void nullsFallBackToTheDefaults() {
		RemodelProperties properties = new RemodelProperties(null, null);
		assertThat(properties.freezeWindow()).isEqualTo(Duration.ofHours(24));
		assertThat(properties.refundNoticeFloor()).isEqualTo(Duration.ofHours(96));
	}

	@Test
	void aFloorAtOrInsideTheFreezeWindowIsRefused() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RemodelProperties(Duration.ofHours(24), Duration.ofHours(24)))
				.withMessageContaining("riviera.booking.remodel.refund-notice-floor");
	}

	@Test
	void aFreezeWindowUnderAMinuteIsRefused() {
		assertThatIllegalArgumentException()
				.isThrownBy(() -> new RemodelProperties(Duration.ofSeconds(30), Duration.ofHours(96)))
				.withMessageContaining("riviera.booking.remodel.freeze-window");
	}
}
