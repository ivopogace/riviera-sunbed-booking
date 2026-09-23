import { Component } from '@angular/core';

/**
 * The solid dot: a set held by an online booking on the operator's daily view, the mark that sits
 * where a staff-marked set shows the check — so a tile's state is its mark and its fill, never its
 * colour alone. The Discover map also uses it as the face of a venue pin with no price yet. That is
 * a different meaning drawn with the same mark, so it gets no sibling drawing: in both places the
 * disc only says "something is here", and the words around it (the tile's state, the pin's
 * `aria-label`) say what.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape. The disc fills with
 * `currentColor` rather than stroking it, so it reads as solid beside the stroked check.
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
