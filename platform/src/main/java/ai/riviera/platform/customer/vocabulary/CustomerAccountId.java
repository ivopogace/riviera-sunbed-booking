package ai.riviera.platform.customer.vocabulary;

/**
 * Technical id of a customer <em>account</em> — deliberately distinct from
 * {@link CustomerId}, the guest-checkout/booking key. Keeping account identity separate from the
 * guest contact row is what lets registration avoid auto-claiming a guest email's past bookings;
 * linking the two is a later, email-verified step (design D-6). Carried by
 * {@link RegistrationOutcome.Registered}.
 */
public record CustomerAccountId(long value) {
}
