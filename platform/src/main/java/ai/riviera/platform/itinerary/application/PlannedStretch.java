package ai.riviera.platform.itinerary.application;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.Tier;

/** One same-set stretch of a plan with the set's placement and its money: per-day price × {@code days} (invariant #5). */
public record PlannedStretch(SetId setId, SetPlacement placement, Tier tier, LocalDate firstDay, LocalDate lastDay,
		int days, MoneyView pricePerDay, MoneyView amount) {
}
