import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Operator console shell (issue #170, epic #141 foundation). The porcelain-light glass chrome
 * that wraps the operator surface at `/operator/:venueId`: a sign-in gate, sticky header, and pill
 * tab nav with a live Requests badge, hosting each tab as a child route. The tourist app shell
 * (`app.ts`) suppresses its own chrome for `/operator/**` (route-data `operatorConsole`), so this
 * component owns the full viewport.
 *
 * <p>Phase 0: routing skeleton only — a child `<router-outlet>` for the six tab routes. The
 * porcelain scoping, sign-in gate, header and tab nav land in the following phases.
 */
@Component({
  selector: 'app-operator-console',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class OperatorConsole {}
