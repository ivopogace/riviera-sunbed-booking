import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../../shared/card-glass';
import { PrimaryCta } from '../../shared/primary-cta';
import { TouchTarget } from '../../shared/touch-target';

/**
 * The public page for venue owners at `/for-venues`, ending in the operator registration card.
 * Its price and money copy is the owner's decision under ADR-0029 (#1736): it names no commission,
 * no payout and no payment provider, and the money paragraph wears "At launch" until #284 ships
 * venue-owned payments. It must not link into the console, whose commission text and Payouts tab
 * still describe the old model.
 */
@Component({
  selector: 'app-for-venues',
  imports: [RouterLink, CardGlass, PrimaryCta, TouchTarget],
  templateUrl: './for-venues.html',
})
export class ForVenues {}
