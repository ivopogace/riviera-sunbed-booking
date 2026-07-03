import { Component } from '@angular/core';

/**
 * A console tab whose Liquid Glass content arrives in a later epic-#141 slice (O3–O8). O1 ships the
 * shell; each placeholder names its upcoming slice and forward-links to the surviving legacy surface
 * so nothing is lost. Reads its tab identity from the route `data` (`tab`). Phase 0: minimal stub;
 * the real placeholder (name + slice note + legacy link) lands in Phase 3.
 */
@Component({
  selector: 'app-console-placeholder',
  template: '<p data-testid="console-placeholder">This section is being restyled.</p>',
})
export class ConsolePlaceholder {}
