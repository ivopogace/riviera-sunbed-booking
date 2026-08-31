import { Directive } from '@angular/core';

/**
 * The pulse of a placeholder block — the one part of a skeleton that must never be hand-copied.
 *
 * <p>`animate-pulse` and `motion-reduce:animate-none` are a pair: written out per element, the
 * guard is one omission away from an animation a reduced-motion visitor cannot switch off. Binding
 * them together is the whole reason this is a directive.
 *
 * <p>It carries no fill, no radius and no size — the call site owns all three. Fill especially:
 * a block's track colour depends on the surface under it (`--riv-card-track` on card glass,
 * `--riv-track-bg` on the ink-coloured panel glass), and a directive-set background would be
 * resolved against the call site's own by stylesheet order rather than class order — the same trap
 * that keeps `border-radius` out of the shared surface directives.
 */
@Directive({
  selector: '[appSkeletonBlock]',
  host: { class: 'animate-pulse motion-reduce:animate-none' },
})
export class SkeletonBlock {}
