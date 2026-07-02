package ai.riviera.platform.booking.adapter.in;

/**
 * The response to an accept/decline decision (issue #98): the booking's technical id and its
 * resulting status — {@code AWAITING_PAYMENT} (payment request issued; {@code CONFIRMED} under
 * the stub profile) or {@code DECLINED}. No booking code (invariant #7), no payment credentials
 * (those go to the guest via the code-gated view, never to the operator).
 */
record RequestDecisionView(long bookingId, String status) {
}
