/**
 * Deliberately Connect-shaped Stripe calls for {@code NoStripeConnectArchitectureTest}'s negative
 * case: one class per forbidden symbol. Outside {@code ai.riviera.platform}, so no production rule
 * scans it. Test scope only; never wired into a context.
 */
package ai.riviera.connectfixture;
