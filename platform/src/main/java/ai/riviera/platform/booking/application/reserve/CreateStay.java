package ai.riviera.platform.booking.application.reserve;

/**
 * The driving port for booking a stitched stay: every stretch claimed all-or-nothing (invariant
 * #2), one code, one collection for the group (design D6/D8). Rationale: RESPONSIBILITIES.md §booking.
 */
public interface CreateStay {

	StayOutcome create(CreateStayCommand command);
}
