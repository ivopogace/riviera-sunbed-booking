package ai.riviera.grantfixture.beta.spi;

/** Supplied by {@code alpha} as a lambda, never named there. */
@FunctionalInterface
public interface BetaGate {

	boolean proceed(int count);
}
