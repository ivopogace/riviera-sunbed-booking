import { Component } from '@angular/core';

/**
 * The solid dot: a set held by an online booking on the operator's daily view, where a staff-marked
 * set shows the check — so a tile's state is its mark and fill, never colour alone. Discover's map
 * also uses it for a venue pin with no price yet, with no sibling drawing: in both the disc only
 * says "something is here", and the words around it (tile state, pin `aria-label`) say what.
 *
 * <p>Zero API surface (see `shared/clock-icon.ts`). Filled with `currentColor`, not stroked, so it
 * reads as solid beside the stroked check.
 */
@Component({
  selector: 'app-dot-icon',
  host: { 'aria-hidden': 'true', class: 'contents' },
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
  >
    <circle cx="12" cy="12" r="8" fill="currentColor" stroke="none" />
  </svg>`,
})
export class DotIcon {}
