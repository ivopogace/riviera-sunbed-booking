package ai.riviera.platform;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Runs recovery-mail sends inline in tests (#369). The production {@link AsyncMailDispatcher} takes the
 * send off the request thread, which would race every {@code MockMailer.lastTo(...)} assertion and make the
 * recovery integration tests flaky. This override keeps them deterministic without weakening what they
 * assert: the off-thread dispatch itself is pinned structurally by {@code AsyncMailDispatcherTest} (it runs
 * on the dedicated pool) and {@code CustomerRecoveryDispatchTest} (no mail work on the caller's thread).
 *
 * <p>Imported by {@link TestcontainersConfiguration}, so every DB-backed integration test picks it up with
 * no per-class annotation — the coverage has to be automatic, because a missed test class would not fail,
 * it would flake. {@code @WebMvcTest} slices get the same treatment from {@code WebSliceStubs}.
 */
@TestConfiguration(proxyBeanMethods = false)
public class SynchronousMailDispatch {

	@Bean
	@Primary
	MailDispatcher synchronousMailDispatcher() {
		return Runnable::run;
	}
}
