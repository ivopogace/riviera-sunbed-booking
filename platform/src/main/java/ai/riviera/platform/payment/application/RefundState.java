package ai.riviera.platform.payment.application;

import ai.riviera.platform.payment.domain.PaymentStatus;

/**
 * The refund-relevant slice of a booking's share of a collection: the collection's lifecycle status
 * and how much of this booking's share the gateway has accepted back so far ({@code 0} until it
 * accepts). Internal to the module — the published answer is {@code RefundProgress}, mapped by
 * {@code RefundService}.
 */
public record RefundState(PaymentStatus status, long refundedMinor) {
}
