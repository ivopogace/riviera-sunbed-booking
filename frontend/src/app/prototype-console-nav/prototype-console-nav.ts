import { Component, TemplateRef, inject, input, output } from '@angular/core';

import { ConsoleNavContext } from './console-nav-support';
import { ConsoleNavB } from './console-nav-b';
import { ConsoleNavC } from './console-nav-c';
import { ConsoleNavD } from './console-nav-d';
import { ConsoleNavE } from './console-nav-e';
import { ConsoleNavF } from './console-nav-f';
import { PrototypeConsoleNavVariant } from './prototype-console-nav-variant';

/**
 * PROTOTYPE — the dispatcher the three hosts render instead of their shipped chrome whenever the
 * variant is not `current`: `operator-console.html` (the venue console), `admin-console.ts` (the
 * admin console) and `app.html` (the plain operator pages that wear `app-operator-chrome` today).
 * Each host hands over its context, its stats strip (`lead`) and its page body as templates, and
 * the variant decides where they go.
 */
@Component({
  selector: 'app-prototype-console-nav',
  imports: [ConsoleNavB, ConsoleNavC, ConsoleNavD, ConsoleNavE, ConsoleNavF],
  host: { class: 'contents' },
  template: `
    @switch (variant()) {
      @case ('b') {
        <app-console-nav-b
          [ctx]="ctx()"
          [lead]="lead()"
          [body]="body()"
          (signOut)="signOut.emit()"
        />
      }
      @case ('c') {
        <app-console-nav-c
          [ctx]="ctx()"
          [lead]="lead()"
          [body]="body()"
          (signOut)="signOut.emit()"
        />
      }
      @case ('d') {
        <app-console-nav-d
          [ctx]="ctx()"
          [lead]="lead()"
          [body]="body()"
          (signOut)="signOut.emit()"
        />
      }
      @case ('e') {
        <app-console-nav-e
          [ctx]="ctx()"
          [lead]="lead()"
          [body]="body()"
          (signOut)="signOut.emit()"
        />
      }
      @case ('f') {
        <app-console-nav-f
          [ctx]="ctx()"
          [lead]="lead()"
          [body]="body()"
          (signOut)="signOut.emit()"
        />
      }
    }
  `,
})
export class PrototypeConsoleNav {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly lead = input<TemplateRef<unknown> | null>(null);
  readonly body = input<TemplateRef<unknown> | null>(null);
  readonly signOut = output<void>();

  protected readonly variant = inject(PrototypeConsoleNavVariant).variant;
}
