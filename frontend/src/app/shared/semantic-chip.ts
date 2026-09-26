import { Directive } from '@angular/core';

/**
 * The PLATFORM-authored chip family (booking mode, "New"), inverted against the descriptive
 * `amenity-chip` family: opaque `--riv-solid-fill-brand` fill, white ink, lighter rim. Never rgba —
 * it sits over arbitrary cover photos and dark map glass (`semantic-chip.contrast.spec.ts`); the
 * rim is decorative, the chip is identified against the card. Carries NO geometry (display,
 * padding, text size): each call site keeps its own box, and radius stays here to avoid an order
 * coin-flip. The `semantic-chip` marker class is load-bearing: specs assert membership by it.
 */
@Directive({
  selector: '[appSemanticChip]',
  host: {
    class:
      'semantic-chip rounded-full border font-bold bg-riv-solid-fill-brand border-[#2f7d92] text-white',
  },
})
export class SemanticChip {}
