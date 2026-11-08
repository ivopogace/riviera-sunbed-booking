package ai.riviera.platform.payment.vocabulary;

/**
 * One booking's part of a collection: the booking, the venue it pays and the money it owes (invariant
 * #5). A single booking is a collection of one share; a stitched stay is one share per stretch under
 * one PaymentIntent (design D6/D8), every stretch paying the same venue (ADR-0029 decision 7).
 */
public record CollectionShare(BookingRef booking, PayeeRef payee, Money amount) {
}
