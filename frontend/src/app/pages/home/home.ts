import { Component, inject, signal } from '@angular/core';

import { BackendStatus, HealthService } from '../../core/health.service';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
})
export class Home {
  private readonly health = inject(HealthService);

  /** Live backend reachability, shown as the deploy's FE↔BE tracer bullet. */
  protected readonly backendStatus = signal<BackendStatus>('UNKNOWN');

  constructor() {
    this.health.checkHealth().subscribe((status) => this.backendStatus.set(status));
  }
}
