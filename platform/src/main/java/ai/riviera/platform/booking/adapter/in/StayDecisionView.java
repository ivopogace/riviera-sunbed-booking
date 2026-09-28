package ai.riviera.platform.booking.adapter.in;

/** The operator's answer to a stay request: the stay's id and the status its stretches now share. */
record StayDecisionView(long stayId, String status) {
}
