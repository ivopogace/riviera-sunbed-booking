/**
 * Deliberately Connect-shaped Stripe calls for {@code NoStripeConnectArchitectureTest}'s negative
 * case: one class per forbidden symbol, none named after its symbol. Outside
 * {@code ai.riviera.platform}, so no production rule scans it. Test scope only; never wired into a
 * context.
 */
package ai.riviera.connectfixture;
