package ai.riviera.platform;

import org.springframework.boot.SpringApplication;

public class TestPlatformApplication {

	static void main(String[] args) {
		SpringApplication.from(PlatformApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
