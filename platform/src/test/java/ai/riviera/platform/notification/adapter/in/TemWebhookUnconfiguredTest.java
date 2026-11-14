package ai.riviera.platform.notification.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.WebSliceStubs;
import ai.riviera.platform.web.adapter.in.SecurityConfig;
import ai.riviera.platform.web.adapter.in.WebCorsConfig;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * With no topic ARN or trust chain configured (every deployment until #370), the feed refuses even a
 * correctly signed message and suppresses nothing ({@link WebSliceStubs}' suppressions throw on a write).
 */
@WebMvcTest(TemWebhookController.class)
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class TemWebhookUnconfiguredTest {

	@Autowired
	MockMvc mvc;

	@Test
	void anUnconfiguredFeedRefusesEvenASignedMessage() throws Exception {
		String body = SnsTestPki.get().notification("{\"type\":\"email_dropped\",\"email_to\":\"x@example.com\"}");

		mvc.perform(post("/api/notifications/tem/webhook").contentType(MediaType.TEXT_PLAIN).content(body))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_SIGNATURE"));
	}
}
