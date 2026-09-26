package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;
import java.util.List;

/**
 * One set position on the read-only beach map, for the days read. {@code tier} (PREMIUM/STANDARD)
 * and {@code availability} are string tokens matching the DB CHECKs; {@code pool} is the typed
 * {@link Pool}, serialised by name. Availability comes from the availability table (invariant #2),
 * never venue's own rows: {@code FREE} on every day asked, {@code TAKEN} on none, else
 * {@code PARTLY_FREE} (never on a one-day read). {@code freeDays} counts the free days;
 * {@code takenDates} names the others, ascending (empty for a free set).
 */
public record SetView(long id, String rowLabel, int positionNo, String tier, Pool pool,
		MoneyView price, int gridX, int gridY, String availability, int freeDays,
		List<LocalDate> takenDates) {
}
