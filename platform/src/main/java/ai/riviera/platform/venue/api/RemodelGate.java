package ai.riviera.platform.venue.api;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.DisturbedSet;
import ai.riviera.platform.venue.vocabulary.GateVerdict;

/**
 * The question {@link BeachMapRemodel#commit} asks its caller after locking the venue's map and
 * diffing the layout, before writing anything: given the disturbed sets (with their staff walk-in
 * holds), may the layout be written, and which sets must be left exactly as stored? Called once,
 * inside the write's transaction with every set row locked; the caller's work in the answer (the
 * edge settles bookings through {@code booking}) shares it. A {@link GateVerdict.Decline} writes
 * nothing, spends no token; a {@link GateVerdict.Proceed} names the kept sets. Per call, no bean.
 */
@FunctionalInterface
public interface RemodelGate {

	GateVerdict proceed(List<DisturbedSet> disturbed);
}
