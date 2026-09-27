package ai.riviera.platform.itinerary.domain;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.StaySpan;

/**
 * The stitching rule (design D7/D13): the same-set stretches covering a stay with the fewest moves,
 * then the shortest ones — a move is judged as the remodel move rule judges it (same row, then
 * closest position, then closest row), summed over the plan, the lowest set id breaking a tie. A
 * shortest path over {@code (day, set)}; pure, so it lives in {@code domain} (ADR-0018). Sets with no
 * placement move at zero distance, so the coast verdict needs only the move count, and with no set
 * placed each day relaxes from the previous day's cheapest set alone (O(sets), not O(sets²)).
 */
public final class ItinerarySearch {

	private ItinerarySearch() {
	}

	/** One same-set run of a plan, first to last day inclusive. */
	public record Stretch(SetId setId, LocalDate firstDay, LocalDate lastDay) {
	}

	/** A plan covering every day of a stay; {@link #moves()} is one less than its stretches. */
	public record Itinerary(List<Stretch> stretches) {

		public Itinerary {
			stretches = List.copyOf(stretches);
		}

		public int moves() {
			return stretches.size() - 1;
		}
	}

	/** How a tapped set took part in the plan: it starts it, ends it, fits no plan in the budget, or there is no plan. */
	public enum Anchoring {
		START, END, UNANCHORABLE, NONE
	}

	/** The plan around a tapped set and the anchor's role in it. */
	public record Anchored(Optional<Itinerary> itinerary, Anchoring anchoring) {
	}

	/** The best plan within {@code maxMoves}, or empty when no set is free on some day or every plan needs more moves. */
	public static Optional<Itinerary> plan(StaySpan span, List<SetId> sets, Map<SetId, SetPlacement> placements,
			Map<SetId, List<LocalDate>> takenDays, int maxMoves) {
		return new Search(span, sets, placements, takenDays, maxMoves).best(null, null);
	}

	/**
	 * The best plan that starts or ends on {@code anchor} within {@code maxMoves} (starting wins a tie);
	 * when none fits, the unanchored best marked {@link Anchoring#UNANCHORABLE}.
	 */
	public static Anchored planAround(StaySpan span, List<SetId> sets, Map<SetId, SetPlacement> placements,
			Map<SetId, List<LocalDate>> takenDays, int maxMoves, SetId anchor) {
		Search search = new Search(span, sets, placements, takenDays, maxMoves);
		Optional<Itinerary> starting = search.best(anchor, null);
		Optional<Itinerary> ending = search.best(null, anchor);
		if (starting.isPresent() && (ending.isEmpty() || search.cost(starting.get()).compareTo(search.cost(ending.get())) <= 0)) {
			return new Anchored(starting, Anchoring.START);
		}
		if (ending.isPresent()) {
			return new Anchored(ending, Anchoring.END);
		}
		Optional<Itinerary> unanchored = search.best(null, null);
		return new Anchored(unanchored, unanchored.isPresent() ? Anchoring.UNANCHORABLE : Anchoring.NONE);
	}

	/** Plan cost, compared lexicographically: moves, then row changes, then positions moved, then rows moved. */
	private record Cost(int moves, int rowChanges, int positions, int rows) implements Comparable<Cost> {

		static final Cost ZERO = new Cost(0, 0, 0, 0);

		/** A move between unplaced sets: one move, no distance. */
		static final Cost UNPLACED_MOVE = new Cost(1, 0, 0, 0);

		Cost plus(Cost move) {
			return new Cost(moves + move.moves, rowChanges + move.rowChanges, positions + move.positions, rows + move.rows);
		}

		@Override
		public int compareTo(Cost other) {
			int byMoves = Integer.compare(moves, other.moves);
			if (byMoves != 0) {
				return byMoves;
			}
			int byRowChanges = Integer.compare(rowChanges, other.rowChanges);
			if (byRowChanges != 0) {
				return byRowChanges;
			}
			int byPositions = Integer.compare(positions, other.positions);
			return byPositions != 0 ? byPositions : Integer.compare(rows, other.rows);
		}
	}

	private static final class Search {

		private final List<LocalDate> days;
		private final List<SetId> sets;
		private final Map<SetId, SetPlacement> placements;
		private final boolean[][] free;
		private final int maxMoves;
		private final boolean unplaced;

		Search(StaySpan span, List<SetId> sets, Map<SetId, SetPlacement> placements,
				Map<SetId, List<LocalDate>> takenDays, int maxMoves) {
			this.days = span.eachDay();
			this.sets = sets.stream().sorted((a, b) -> Long.compare(a.value(), b.value())).toList();
			this.placements = placements;
			this.maxMoves = maxMoves;
			this.unplaced = this.sets.stream().noneMatch(placements::containsKey);
			this.free = new boolean[days.size()][this.sets.size()];
			for (int s = 0; s < this.sets.size(); s++) {
				Set<LocalDate> taken = new HashSet<>(takenDays.getOrDefault(this.sets.get(s), List.of()));
				for (int d = 0; d < days.size(); d++) {
					free[d][s] = !taken.contains(days.get(d));
				}
			}
		}

		Optional<Itinerary> best(SetId startOn, SetId endOn) {
			int start = indexOf(startOn);
			int end = indexOf(endOn);
			if (startOn != null && start < 0 || endOn != null && end < 0 || sets.isEmpty()) {
				return Optional.empty();
			}
			Cost[][] cost = new Cost[days.size()][sets.size()];
			int[][] from = new int[days.size()][sets.size()];
			seedFirstDay(cost, start);
			for (int d = 1; d < days.size(); d++) {
				relaxDay(cost, from, d);
			}
			int last = cheapestLastSet(cost[days.size() - 1], end);
			return last < 0 ? Optional.empty() : Optional.of(walkBack(from, last));
		}

		/** Day one: every free set (or the anchor alone) starts a plan at no cost. */
		private void seedFirstDay(Cost[][] cost, int start) {
			for (int s = 0; s < sets.size(); s++) {
				if (free[0][s] && (start < 0 || s == start)) {
					cost[0][s] = Cost.ZERO;
				}
			}
		}

		private void relaxDay(Cost[][] cost, int[][] from, int d) {
			if (unplaced) {
				relaxDayFromCheapest(cost, from, d);
				return;
			}
			for (int s = 0; s < sets.size(); s++) {
				if (free[d][s]) {
					relaxSet(cost, from, d, s);
				}
			}
		}

		/** Day {@code d}, set {@code s}: keep the cheapest way in — staying, or moving from another set. */
		private void relaxSet(Cost[][] cost, int[][] from, int d, int s) {
			for (int t = 0; t < sets.size(); t++) {
				Cost previous = cost[d - 1][t];
				if (previous != null) {
					offer(cost, from, d, s, t, t == s ? previous : previous.plus(moveCost(t, s)));
				}
			}
		}

		/**
		 * With every move costing alike, the one move worth offering into a set comes from the previous
		 * day's cheapest set (the runner-up, into the cheapest itself), offered in set order so a tie falls
		 * as in the pair loop.
		 */
		private void relaxDayFromCheapest(Cost[][] cost, int[][] from, int d) {
			Cost[] previous = cost[d - 1];
			int cheapest = -1;
			int runnerUp = -1;
			for (int t = 0; t < sets.size(); t++) {
				if (previous[t] == null) {
					continue;
				}
				if (cheapest < 0 || previous[t].compareTo(previous[cheapest]) < 0) {
					runnerUp = cheapest;
					cheapest = t;
				} else if (runnerUp < 0 || previous[t].compareTo(previous[runnerUp]) < 0) {
					runnerUp = t;
				}
			}
			if (cheapest < 0) {
				return;
			}
			Cost viaCheapest = previous[cheapest].plus(Cost.UNPLACED_MOVE);
			Cost viaRunnerUp = runnerUp < 0 ? null : previous[runnerUp].plus(Cost.UNPLACED_MOVE);
			for (int s = 0; s < sets.size(); s++) {
				if (!free[d][s]) {
					continue;
				}
				int mover = cheapest == s ? runnerUp : cheapest;
				Cost viaMover = cheapest == s ? viaRunnerUp : viaCheapest;
				if (mover >= 0 && mover < s) {
					offer(cost, from, d, s, mover, viaMover);
				}
				if (previous[s] != null) {
					offer(cost, from, d, s, s, previous[s]);
				}
				if (mover > s) {
					offer(cost, from, d, s, mover, viaMover);
				}
			}
		}

		/**
		 * Keep {@code candidate}, reached from set {@code t}, as the way into set {@code s} on day {@code d}
		 * when it beats the one kept.
		 */
		private void offer(Cost[][] cost, int[][] from, int d, int s, int t, Cost candidate) {
			if (candidate.moves() <= maxMoves && (cost[d][s] == null || candidate.compareTo(cost[d][s]) < 0)) {
				cost[d][s] = candidate;
				from[d][s] = t;
			}
		}

		/** The set the cheapest plan ends on (the anchor alone when one must end it), or -1 when none reaches the last day. */
		private int cheapestLastSet(Cost[] lastDay, int end) {
			int last = -1;
			for (int s = 0; s < sets.size(); s++) {
				if (lastDay[s] != null && (end < 0 || s == end) && (last < 0 || lastDay[s].compareTo(lastDay[last]) < 0)) {
					last = s;
				}
			}
			return last;
		}

		Cost cost(Itinerary itinerary) {
			Cost total = Cost.ZERO;
			List<Stretch> stretches = itinerary.stretches();
			for (int i = 1; i < stretches.size(); i++) {
				total = total.plus(moveCost(sets.indexOf(stretches.get(i - 1).setId()), sets.indexOf(stretches.get(i).setId())));
			}
			return total;
		}

		private Itinerary walkBack(int[][] from, int last) {
			List<Stretch> reversed = new ArrayList<>();
			int s = last;
			int lastDay = days.size() - 1;
			for (int d = days.size() - 1; d >= 0; d--) {
				int previous = from[d][s];
				if (d == 0 || previous != s) {
					reversed.add(new Stretch(sets.get(s), days.get(d), days.get(lastDay)));
					lastDay = d - 1;
					s = previous;
				}
			}
			return new Itinerary(reversed.reversed());
		}

		private Cost moveCost(int fromSet, int toSet) {
			SetPlacement a = placements.get(sets.get(fromSet));
			SetPlacement b = placements.get(sets.get(toSet));
			if (a == null || b == null) {
				return Cost.UNPLACED_MOVE;
			}
			int rows = Math.abs(a.gridY() - b.gridY());
			int positions = Math.abs(a.positionNo() - b.positionNo());
			return new Cost(1, rows == 0 ? 0 : 1, positions, rows);
		}

		private int indexOf(SetId set) {
			return set == null ? -1 : sets.indexOf(set);
		}
	}
}
