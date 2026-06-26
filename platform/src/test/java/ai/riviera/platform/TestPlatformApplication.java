package ai.riviera.platform;

import org.springframework.boot.SpringApplication;

public class TestPlatformApplication {

	public static void main(String[] args) {
		SpringApplication.from(PlatformApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
