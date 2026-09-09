package ai.riviera.platform.booking.domain;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetSpot;

/** A spot with no availability row on {@code date} — a candidate the move rule may pick for that date only. */
public record FreeSpot(SetSpot spot, LocalDate date) {
}
