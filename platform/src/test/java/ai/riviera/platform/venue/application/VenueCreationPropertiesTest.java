package ai.riviera.platform.venue.application;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The boot guard on the platform's default commission rate (issue #692): an out-of-range
 * configured value must fail construction — and therefore the boot — rather than stamp invalid
 * venue rows (the V2 CHECK constraint would refuse them one insert at a time).
 */
class VenueCreationPropertiesTest {

	@Test
	void acceptsTheFullBpsRange() {
		assertEquals(0, new VenueCreationProperties(0).defaultCommissionBps());
		assertEquals(500, new VenueCreationProperties(500).defaultCommissionBps());
		assertEquals(10_000, new VenueCreationProperties(10_000).defaultCommissionBps());
	}

	@Test
	void rejectsOutOfRangeDefault() {
		assertThrows(IllegalArgumentException.class, () -> new VenueCreationProperties(-1));
		assertThrows(IllegalArgumentException.class, () -> new VenueCreationProperties(10_001));
	}
}
