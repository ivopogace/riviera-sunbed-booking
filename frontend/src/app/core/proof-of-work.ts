import { httpResource } from '@angular/common/http';
import { computed, Service } from '@angular/core';

import { CHALLENGE_URL } from '../shared/challenge';

/**
 * Whether the platform currently fences its public writes with a proof-of-work challenge
 * (ADR-0016). The answer is the challenge endpoint's own: a challenge means on, a `204` means the
 * kill switch is off and the forms hide the widget. Probed once per SPA session, on first use.
 *
 * <p>A transport failure reads as **on**: the fence is the server's to lift, and the widget then
 * shows its own error rather than a form that silently submits without a solution.
 */
@Service()
export class ProofOfWork {
  private readonly probe = httpResource<unknown>(() => CHALLENGE_URL);

  /** `true` / `false` once the probe answered; `undefined` while it is in flight. */
  readonly enabled = computed<boolean | undefined>(() => {
    if (this.probe.status() === 'error') {
      return true;
    }
    if (!this.probe.hasValue()) {
      return undefined;
    }
    return this.probe.value() !== null;
  });
}
