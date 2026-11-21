package ai.riviera.platform;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Invariant #6 over production and test code alike: nothing reads the JVM default zone. A no-argument
 * {@code LocalDate.now()} is the UTC date on a CI runner and the Tirane date on a laptop, so a test dated
 * with it lands a day apart from one dated in {@code Europe/Tirane} between Tirane's midnight and UTC's
 * (#1827). Read "today" from the context {@code Clock} with {@link TiraneDaytimeClock#today}.
 */
class DefaultZoneArchitectureTests {

	private static final JavaClasses ALL_CLASSES = new ClassFileImporter()
			.importPackages(ArchitectureTestSupport.PRODUCTION_BASE);

	private static final String NOW = "now";

	@Test
	void nothingReadsTheJvmDefaultZone() {
		ArchRule rule = noClasses().should().callMethod(LocalDate.class, NOW)
				.orShould().callMethod(LocalDateTime.class, NOW)
				.orShould().callMethod(LocalTime.class, NOW)
				.orShould().callMethod(ZonedDateTime.class, NOW)
				.orShould().callMethod(OffsetDateTime.class, NOW)
				.orShould().callMethod(Year.class, NOW)
				.orShould().callMethod(YearMonth.class, NOW)
				.orShould().callMethod(ZoneId.class, "systemDefault")
				.orShould().callMethod(Clock.class, "systemDefaultZone")
				.because("a civil date or time is read in Europe/Tirane, never the JVM default zone (invariant #6)");

		rule.check(ALL_CLASSES);
	}
}
