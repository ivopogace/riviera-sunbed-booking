import { Directive } from '@angular/core';

/**
 * The pulse of a placeholder block: binds `animate-pulse` to `motion-reduce:animate-none`, so no
 * hand-copied skeleton drops the guard a reduced-motion visitor needs. Never copy the pair.
 *
 * No fill, radius or size — the call site owns all three. Never set a fill here: the track colour
 * depends on the surface under it (`--riv-card-track` on card glass, `--riv-track-bg` on panel
 * glass) and a directive's background resolves by stylesheet order (`riviera-tailwind` rule 3).
 */
@Directive({
  selector: '[appSkeletonBlock]',
  host: { class: 'animate-pulse motion-reduce:animate-none' },
})
export class SkeletonBlock {}
