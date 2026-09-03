package ai.riviera.platform.challenge.adapter.in;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.challenge.api.ProofOfWorkChallenges;

/**
 * The public proof-of-work challenge endpoint the widget fetches from. Anonymous by definition and
 * on its own per-IP rate-limit budget; sets no cookie and is never cacheable — every answer is a
 * fresh nonce. {@code 204} when the fence is switched off, which is what tells the SPA to hide the
 * widget.
 */
@RestController
class ChallengeController {

	static final String PATH = "/api/auth/challenge";

	private final ProofOfWorkChallenges challenges;

	ChallengeController(ProofOfWorkChallenges challenges) {
		this.challenges = challenges;
	}

	@GetMapping(PATH)
	ResponseEntity<String> issue() {
		if (!challenges.enabled()) {
			return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
		}
		return ResponseEntity.ok()
				.cacheControl(CacheControl.noStore())
				.contentType(MediaType.APPLICATION_JSON)
				.body(challenges.issue());
	}
}
