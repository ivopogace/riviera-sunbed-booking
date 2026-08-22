import { Directive } from '@angular/core';

/**
 * One filled, pulsing placeholder block — the shape a loading surface shows where a real block
 * will land.
 *
 * <p>A directive rather than a copied class string because the pair that matters is
 * `animate-pulse` + `motion-reduce:animate-none`: hand-copied per element, the guard is one
 * omission away from an animation a reduced-motion visitor cannot switch off.
 *
 * <p>Carries no radius and no size — the call site owns both. Each surface's blocks differ, and
 * Tailwind resolves competing radii by stylesheet order rather than class order, so a radius here
 * would be a coin-flip against the consumer's own.
 */
@Directive({
  selector: '[appSkeletonBlock]',
  host: { class: 'animate-pulse bg-(--riv-card-track) motion-reduce:animate-none' },
})
export class SkeletonBlock {}
