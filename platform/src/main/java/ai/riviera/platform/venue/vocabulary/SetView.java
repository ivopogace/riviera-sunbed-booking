package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;
import java.util.List;

/**
 * One set position on the read-only beach map, for the days the map was read for. {@code tier}
 * (PREMIUM/STANDARD) and {@code availability} are carried as their string tokens — the same values
 * the database CHECK constraints allow and the frontend renders; {@code pool} is the typed
 * {@link Pool}, serialised by name so the wire carries the same tokens. Availability is sourced from
 * the authoritative availability table (invariant #2), never from venue's own rows.
 *
 * <p>{@code availability} is {@code FREE} when the set is free on every day asked, {@code TAKEN} when
 * it is free on none, and {@code PARTLY_FREE} otherwise — which a one-day read can never answer.
 * {@code freeDays} counts the days it is free on and {@code takenDates} names the days it is not,
 * ascending (empty for a free set), so a client can tell a tourist which of their days a set covers.
 */
public record SetView(long id, String rowLabel, int positionNo, String tier, Pool pool,
		MoneyView price, int gridX, int gridY, String availability, int freeDays,
		List<LocalDate> takenDates) {
}
