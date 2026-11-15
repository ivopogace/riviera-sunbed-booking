package ai.riviera.platform.shared;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Refuses a boot that is not deployable (ADR-0031): every {@link BootPostureGuard} gap, reported in one abort.
 * A bean-factory post-processor, so it runs before any regular singleton, the datasource included, and a bare
 * boot names what it lacks rather than the first bean that tripped over it.
 */
@Component
final class BootPostureCheck implements BeanFactoryPostProcessor {

	@Override
	public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
		Environment environment =
				beanFactory.getBean(ConfigurableApplicationContext.ENVIRONMENT_BEAN_NAME, Environment.class);
		List<String> gaps = beanFactory.getBeansOfType(BootPostureGuard.class, false, false).values().stream()
				.map(guard -> guard.gap(environment))
				.flatMap(Optional::stream)
				.sorted()
				.toList();
		if (!gaps.isEmpty()) {
			throw new IllegalStateException("Boot refused, not deployable as configured (ADR-0031). Supply each of:\n  - "
					+ String.join("\n  - ", gaps));
		}
	}
}
