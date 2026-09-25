package ai.riviera.platform.venue.api;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.GateVerdict;

/**
 * The question {@link BeachMapRemodel#commit} asks its caller after it has locked the venue's map
 * and diffed the layout, and before it writes anything: given the sets this save disturbs — with
 * their staff walk-in holds — may the layout be written, and which of those sets must be left
 * exactly as stored? Called once, inside the write's transaction, with every set row of the venue
 * locked; whatever the caller does in the answer (the edge settles the bookings through
 * {@code booking}) shares that transaction. A {@link GateVerdict.Decline} writes nothing and spends
 * no token; a {@link GateVerdict.Proceed} names the kept sets. A parameter, not a bean: each caller
 * decides per call.
 */
@FunctionalInterface
public interface RemodelGate {

	GateVerdict proceed(List<DisturbedSet> disturbed);
}
