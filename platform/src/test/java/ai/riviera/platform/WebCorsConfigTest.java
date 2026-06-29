package ai.riviera.platform;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.booking.application.in.BookingOutcome;
import ai.riviera.platform.booking.application.in.CreateBooking;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueCatalog;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pins the CORS contract for the deployed frontend (invariant: FE↔BE works across
 * origins). A browser preflight from the configured Pages origin must be answered
 * with a matching {@code Access-Control-Allow-Origin}; an unknown origin must not be.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebCorsConfigTest.StubVenueCatalog.class})
@TestPropertySource(properties = "app.web.cors.allowed-origins=https://ivopogace.github.io")
class WebCorsConfigTest {

	@Autowired
	MockMvc mockMvc;

	/**
	 * The web slice registers every {@code @RestController} (including the venue read
	 * controller) but not {@code @Repository} beans, so its {@link VenueCatalog} port is
	 * stubbed here. This test only exercises the CORS/security filter chain on a preflight,
	 * which never reaches the controller — an empty result is enough.
	 */
	@TestConfiguration(proxyBeanMethods = false)
	static class StubVenueCatalog {

		@Bean
		VenueCatalog venueCatalog() {
			return new VenueCatalog() {
				@Override
				public Optional<ai.riviera.platform.venue.api.VenueMapView> findVenueMap(
						ai.riviera.platform.venue.api.VenueId id, LocalDate date) {
					return Optional.empty();
				}

				@Override
				public Optional<String> poolOf(SetId setId) {
					return Optional.empty();
				}

				@Override
				public Optional<ai.riviera.platform.venue.api.SetBookingInfo> setBookingInfo(SetId setId) {
					return Optional.empty();
				}
			};
		}

		/**
		 * {@code BookingController} is loaded by {@code @WebMvcTest}, so its {@link CreateBooking}
		 * dependency must be satisfied. The preflight tests never reach the controller, so a
		 * trivial stub is enough.
		 */
		@Bean
		CreateBooking createBooking() {
			return command -> BookingOutcome.Rejected.NO_SUCH_SET;
		}

		/**
		 * {@code VenueReadController} computes the default booking date from a {@link Clock}
		 * (issue #44). The web slice does not load {@code TimeConfig}, so the bean is supplied
		 * here; the preflight tests never reach the controller, so the system clock is fine.
		 */
		@Bean
		Clock clock() {
			return Clock.systemUTC();
		}
	}

	@Test
	void preflightFromPagesOriginIsAllowed() throws Exception {
		mockMvc.perform(options("/actuator/health")
						.header("Origin", "https://ivopogace.github.io")
						.header("Access-Control-Request-Method", "GET"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", "https://ivopogace.github.io"));
	}

	@Test
	void preflightFromUnknownOriginIsRejected() throws Exception {
		mockMvc.perform(options("/actuator/health")
						.header("Origin", "https://evil.example.com")
						.header("Access-Control-Request-Method", "GET"))
				.andExpect(status().isForbidden());
	}
}
