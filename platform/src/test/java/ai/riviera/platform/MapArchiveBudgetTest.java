package ai.riviera.platform;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The committed tile archive stays within the size at which ADR-0022 reopens its storage decision.
 * The budget is the ADR's revisit trigger, not a tunable: an archive over it means revisiting the
 * decision (the ADR lists the measured size levers in order), never raising the constant.
 */
class MapArchiveBudgetTest {

	/** Gradle runs tests from {@code platform/}, where the served directory lives. */
	private static final Path ARCHIVE = Path.of("map", "riviera.pmtiles");
	private static final long REVISIT_BUDGET_BYTES = 80_000_000L;

	@Test
	void committedArchiveStaysUnderTheRevisitBudget() throws IOException {
		assertTrue(Files.exists(ARCHIVE), "missing " + ARCHIVE.toAbsolutePath() + " — run scripts/build-riviera-map.sh --tiles");
		long size = Files.size(ARCHIVE);
		assertTrue(size <= REVISIT_BUDGET_BYTES, "the riviera map archive is " + size + " bytes, over the "
				+ REVISIT_BUDGET_BYTES + "-byte budget: revisit ADR-0022's storage decision before committing it");
	}
}
