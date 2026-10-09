package ai.riviera.platform.notification;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.application.Mailer;
import ai.riviera.platform.notification.application.TransactionalMailService;

import static org.assertj.core.api.Assertions.assertThat;

/** Scratch probe for #1465 candidate 2 — RequestExpiredMailIT's exact context key. Not committed. */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ProbeMailerIdentityIT {

	@Autowired MockMailer mailer;
	@Autowired ApplicationContext context;

	@Test
	void theServiceSendsThroughTheAutowiredMockMailer() {
		Object held = ReflectionTestUtils.getField(context.getBean(TransactionalMailService.class), "mailer");
		System.out.println("PROBE mailers: " + context.getBeansOfType(Mailer.class).keySet() + " held="
				+ held.getClass().getName());
		assertThat(held).isSameAs(mailer);
	}
}
