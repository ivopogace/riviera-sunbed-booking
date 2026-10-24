package ai.riviera.platform.monitoring.adapter.in;

import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.stereotype.Component;

/**
 * The running build's commit id on the public {@code /actuator/info}, as {@code {"commit":"<sha>"}}, so the CD poll
 * tells the new instance from the old one (#1632). A value that is not a lowercase hex commit id is never published.
 * The info surface and its exposure are pinned by {@code ActuatorHardeningIT}; posture: {@code production-hardening.md}.
 */
@Component
class BuildCommitInfoContributor implements InfoContributor {

	private static final String KEY = "commit";
	private static final Pattern COMMIT_ID = Pattern.compile("[0-9a-f]{7,64}");

	private final Optional<String> commit;

	BuildCommitInfoContributor(@Value("${riviera.observability.build-commit:}") String commit) {
		this.commit = Optional.of(commit.strip()).filter(value -> COMMIT_ID.matcher(value).matches());
	}

	@Override
	public void contribute(Info.Builder builder) {
		commit.ifPresent(value -> builder.withDetail(KEY, value));
	}
}
