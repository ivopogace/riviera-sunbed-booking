package ai.riviera.platform.venue.application;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The validated intent to replace a venue's whole beach-map layout in one write —
 * the complete desired set of positions the operator generated + painted, sent as one bulk PUT. Each
 * element is a {@link SetCommand}, already range/token-validated by its own compact constructor (tier,
 * pool, integer minor-unit price, 1-based coordinates), so this record only adds the whole-layout
 * concerns the single-set path never had: it must be non-empty, bounded in size, and internally
 * consistent (no two cells claim the same grid cell or the same row+position, no row label spans two
 * grid rows).
 *
 * <p>Generate-time defaults (row A priced as front-row premium, later rows standard) are the
 * <em>frontend's</em> concern — the client builds the full grid and this command persists exactly what
 * it is given. The list is defensively copied and unmodifiable.
 */
public record LayoutCommand(List<SetCommand> sets) {

	/** The maximum layout size: the design caps generation at 26 rows × 40 positions. */
	public static final int MAX_SETS = 26 * 40;

	public LayoutCommand {
		sets = List.copyOf(sets); // defensive copy + null-hostile
	}

	boolean isEmpty() {
		return sets.isEmpty();
	}

	boolean tooLarge() {
		return sets.size() > MAX_SETS;
	}

	/**
	 * The first layout-uniqueness conflict <em>within</em> the submitted batch, if any — position clashes
	 * take priority over cell clashes (mirroring {@code JdbcVenues.findConflict}). The DB UNIQUE
	 * constraints (V2/V12) remain the race-safe backstop; this pre-check returns a precise rejection
	 * instead of surfacing a raw constraint violation.
	 */
	Optional<Venues.Conflict> duplicateWithin() {
		Set<String> positions = new HashSet<>();
		Set<String> cells = new HashSet<>();
		for (SetCommand c : sets) {
			if (!positions.add(c.rowLabel() + ' ' + c.positionNo())) {
				return Optional.of(Venues.Conflict.DUPLICATE_POSITION);
			}
		}
		for (SetCommand c : sets) {
			if (!cells.add(c.gridX() + " " + c.gridY())) {
				return Optional.of(Venues.Conflict.CELL_TAKEN);
			}
		}
		return Optional.empty();
	}

	/**
	 * Whether one {@code rowLabel} appears under two distinct {@code gridY} values — two physical rows
	 * sharing a name, which every label-grouping surface would merge into one. The batch twin of the
	 * rename path's {@code ROW_NAME_TAKEN} rule; not a {@link Venues.Conflict} because no DB constraint
	 * can see it (gap-cell numbering keeps every {@code (row_label, position_no)} pair unique).
	 */
	boolean splitsRowLabel() {
		Map<String, Integer> rowOf = new HashMap<>();
		for (SetCommand c : sets) {
			Integer first = rowOf.putIfAbsent(c.rowLabel(), c.gridY());
			if (first != null && first != c.gridY()) {
				return true;
			}
		}
		return false;
	}
}
