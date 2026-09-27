package ai.riviera.platform.payment.vocabulary;

/**
 * One booking's part of a collection: the booking and the money it owes (invariant #5). A single
 * booking is a collection of one share; a stitched stay is one share per stretch under one
 * PaymentIntent (design D6/D8).
 */
public record CollectionShare(BookingRef booking, Money amount) {
}
