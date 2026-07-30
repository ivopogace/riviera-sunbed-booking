package ai.riviera.platform.shared;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The budget arithmetic's own falsifiability proof (#456).
 *
 * <p>This class exists because the guard it replaces did not have one. {@code MailTransportPropertiesTest
 * #theCombinedDrainOfEveryPoolFitsTheMailShutdownBudget} asserted
 * {@code SHUTDOWN_BUDGET_MS * DRAINING_POOLS <= MAIL_SHUTDOWN_BUDGET_MS} where the left operand was
 * <em>defined</em> as the right divided by the same factor — true for every positive integer pair, so
 * the assertion could not fail. Showing the sum rejecting an oversized claim set is what makes the
 * platform rule built on it mean something.
 */
class ShutdownBudgetTest {

	@Test
	void rejectsAClaimSetThatOverrunsTheGrace() {
		assertThat(ShutdownBudget.fits(List.of(10_000, 10_000, 5_000)))
				.as("today's three pools claim 25s of the %dms grace, leaving the rest for the web layer"
						+ " and Hikari to close in order", ShutdownBudget.SIGTERM_GRACE_MS)
				.isTrue();

		assertThat(ShutdownBudget.fits(List.of(10_000, 10_000, 5_000, 10_000)))
				.as("a fourth pool pushing the SUM past the grace must be rejected — pools drain"
						+ " SEQUENTIALLY, so windows that each fit alone can still overrun together")
				.isFalse();
	}

	@Test
	void aClaimSetExactlyFillingTheGraceStillFits() {
		assertThat(ShutdownBudget.fits(List.of(ShutdownBudget.SIGTERM_GRACE_MS)))
				.as("the bound is the grace itself, not one millisecond short of it")
				.isTrue();
		assertThat(ShutdownBudget.fits(List.of(ShutdownBudget.SIGTERM_GRACE_MS + 1))).isFalse();
	}

	@Test
	void noClaimsSpendNothing() {
		assertThat(ShutdownBudget.claimed(List.of()))
				.as("an empty claim set must read as zero, so a scan that found no pools cannot be"
						+ " mistaken for a budget that balances")
				.isZero();
	}
}
