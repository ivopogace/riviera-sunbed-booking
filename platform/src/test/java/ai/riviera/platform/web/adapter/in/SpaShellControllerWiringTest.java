package ai.riviera.platform.web.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.WebSliceStubs;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** {@link SpaShellController} wires on its own: its {@code PublicWebProperties} never depends on another controller. */
@WebMvcTest(SpaShellController.class)
@Import({SecurityConfig.class, WebSliceStubs.class})
class SpaShellControllerWiringTest {

	@Autowired
	MockMvc mvc;

	@Test
	void servesTheShellWithNoOtherControllerLoaded() throws Exception {
		mvc.perform(get("/")).andExpect(status().isOk());
	}
}
