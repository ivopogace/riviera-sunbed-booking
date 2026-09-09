package ai.riviera.platform.booking.vocabulary;

import ai.riviera.platform.venue.vocabulary.SetId;

/** A set as the operator and the guest name it: its id, row label and position number. */
public record SpotRef(SetId setId, String rowLabel, int positionNo) {
}
