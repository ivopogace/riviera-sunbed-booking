package ai.riviera.platform.customer.application;

import java.time.Period;

/**
 * The retention policy the sweep applies: how long a guest contact may be held after its last retention
 * basis, and how many rows one run may scrub.
 *
 * <p>A plain application-layer value, deliberately carrying no configuration type — the
 * {@code @ConfigurationProperties} record lives in {@code adapter/in} and is mapped to this
 * (the {@code RequestProperties → RequestWindows} pattern), so the inner hexagon stays framework-light.
 *
 * <p>{@code window} is a {@link Period}, <strong>not</strong> a {@code Duration}: retention periods are
 * expressed in years (e.g. {@code P10Y}) and ISO-8601 durations have no year or month unit, so a
 * {@code Duration} could not parse one.
 *
 * @param window    how far back the retention basis must reach for a contact to still be held; a booking
 *                  dated on or after {@code today − window} (in {@code Europe/Tirane}) retains the contact
 * @param batchSize the most rows a single sweep may scrub, so a run stays bounded regardless of backlog
 */
public record RetentionWindow(Period window, int batchSize) {
}
