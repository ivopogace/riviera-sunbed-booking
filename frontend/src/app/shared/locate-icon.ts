import { Component } from '@angular/core';

/**
 * The "where I am" crosshair: Near me's mark on the sheet, the desktop panel and the coast
 * picker, and the head's located indicator.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape. The 13 px default is what sits
 * beside this app's 13–14 px control text; a bigger box runs Near me into the tile credit at
 * 320 px (`discover-sheet.e2e.ts`). A call site resizes with `[&_svg]:size-[17px]`.
 */
@Component({
  selector: 'app-locate-icon',
  host: { 'aria-hidden': 'true', class: 'contents' },
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
  >
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>`,
})
export class LocateIcon {}
