package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.notification.application.SupportContact;
import ai.riviera.platform.web.adapter.in.SecurityConfig;
import ai.riviera.platform.web.adapter.in.WebCorsConfig;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /api/support-contact} through the real filter chain: anonymous, and a channel with no
 * configured value is {@code null}, never a placeholder. {@code WebSliceStubs}' clock stands at
 * 2026-06-30, inside the season; the zone edge is {@code SupportContactSeasonTest}'s.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class SupportContactControllerTest {

	private static final String PATH = "/api/support-contact";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	SupportContact contact;

	@Test
	void anAnonymousVisitorReadsBothConfiguredChannels() throws Exception {
		SupportContact configured = new SupportContact("help@example.com", "355691234567");
		when(contact.email()).thenReturn(configured.email());
		when(contact.whatsappNumber()).thenReturn(configured.whatsappNumber());
		when(contact.whatsappLink()).thenReturn(configured.whatsappLink());

		mvc.perform(get(PATH))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.email").value("help@example.com"))
				.andExpect(jsonPath("$.whatsapp.number").value("+355691234567"))
				.andExpect(jsonPath("$.whatsapp.url").value("https://wa.me/355691234567"))
				.andExpect(jsonPath("$.sameDayReply").value(true));
	}

	@Test
	void anUnconfiguredChannelIsNullNotAPlaceholder() throws Exception {
		when(contact.email()).thenReturn(SupportContact.NONE.email());
		when(contact.whatsappNumber()).thenReturn(SupportContact.NONE.whatsappNumber());
		when(contact.whatsappLink()).thenReturn(SupportContact.NONE.whatsappLink());

		mvc.perform(get(PATH))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.email").isEmpty())
				.andExpect(jsonPath("$.whatsapp").isEmpty());
	}
}
