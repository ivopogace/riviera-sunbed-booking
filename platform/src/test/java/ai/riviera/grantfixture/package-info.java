/**
 * An over-granted module tree for {@code UnusedAllowedDependencyTests}' negative case: {@code alpha}
 * grants all four {@code beta} surfaces and uses three, two only in bytecode (a lambda as the
 * {@code beta::spi} gate, a {@code switch} over a returned, never-imported {@code beta::vocabulary}
 * enum). Its one unused grant is {@code beta::events}; {@code gamma}'s is {@code beta::spi}, whose type
 * it meets only as a parameter it feeds {@code null}.
 */
package ai.riviera.grantfixture;
