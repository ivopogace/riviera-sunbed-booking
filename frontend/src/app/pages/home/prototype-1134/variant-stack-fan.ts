import { Component, computed, input, output, signal } from '@angular/core';

import { TouchTarget } from '../../../shared/touch-target';
import { fanOffsets, MAP_CHROME_DISC, PinCluster, PlacedPin } from './pin-crowding';

/**
 * THROWAWAY PROTOTYPE — variant A, **Stack & fan**.
 *
 * <p>A crowd collapses into one disc wearing the venue count, drawn over two offset ghost discs so
 * the silhouette itself says "there is a stack under here" before anyone reads the numeral.
 * Pressing it does not zoom — zooming provably cannot separate the Dhërmi three at any zoom the
 * map offers — it fans the members onto a ring, each on its own tether, over a scrim that quiets
 * the rest of the map. Press the anchor again, the scrim, or Escape to restack.
 *
 * <p>The argument: the map stays the thing you are looking at, and the count is honest before you
 * commit a press. The cost: a second press before any venue, and the fanned pins are not where
 * their venues are.
 */
@Component({
  selector: 'app-variant-stack-fan',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `
    @if (open(); as anchor) {
      <!-- A real control: the scrim is how a pointer restacks, so it takes the press itself. -->
      <button
        type="button"
        class="pointer-events-auto absolute inset-0 size-full cursor-default bg-[rgba(7,42,58,0.34)] backdrop-blur-[1px] motion-safe:transition-opacity motion-safe:starting:opacity-0"
        aria-label="Restack these venues"
        data-touch-exempt="a full-surface dismiss layer, not a sized control"
        (click)="restack()"
      ></button>
      <svg class="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
        @for (spoke of spokes(); track spoke.id) {
          <line
            [attr.x1]="anchor.x"
            [attr.y1]="anchor.y"
            [attr.x2]="spoke.x"
            [attr.y2]="spoke.y"
            stroke="var(--riv-solid-btn-fill)"
            stroke-width="2"
            stroke-linecap="round"
          />
        }
      </svg>
    }

    @for (cluster of clusters(); track cluster.key) {
      @if (cluster.members.length === 1) {
        <button
          type="button"
          appTouchTarget
          [class]="disc"
          class="pointer-events-auto absolute"
          [style.left.px]="cluster.x"
          [style.top.px]="cluster.y"
          [style.translate]="'-50% -50%'"
          [attr.aria-label]="label(cluster.members[0])"
          [attr.aria-expanded]="selected() === cluster.members[0].pin.id"
          (click)="chosen.emit(cluster.members[0].pin.id)"
        >
          <span aria-hidden="true">&#x25cf;</span>
        </button>
      } @else if (openKey() === cluster.key) {
        @for (member of fanned(cluster); track member.pin.id) {
          <button
            type="button"
            appTouchTarget
            [class]="disc"
            class="pointer-events-auto absolute motion-safe:[transition:translate_0.16s_ease-out]"
            [style.left.px]="member.x"
            [style.top.px]="member.y"
            [style.translate]="'-50% -50%'"
            [attr.aria-label]="label(member)"
            [attr.aria-expanded]="selected() === member.pin.id"
            (click)="chosen.emit(member.pin.id)"
          >
            <span aria-hidden="true">&#x25cf;</span>
          </button>
        }
        <button
          type="button"
          appTouchTarget
          class="pointer-events-auto absolute inline-flex size-11 touch-manipulation items-center justify-center rounded-full border-2 border-riv-solid-btn-fill bg-riv-solid-btn-ink text-[15px] leading-none font-bold text-riv-solid-btn-fill tabular-nums shadow-[0_6px_18px_rgba(7,42,58,0.45)]"
          [style.left.px]="cluster.x"
          [style.top.px]="cluster.y"
          [style.translate]="'-50% -50%'"
          [attr.aria-label]="'Restack the ' + cluster.members.length + ' venues here'"
          aria-expanded="true"
          (click)="restack()"
        >
          <span aria-hidden="true">&#x2715;</span>
        </button>
      } @else {
        <!-- Two ghost discs peel out from under the live one: the stack is legible as a shape. -->
        <span
          class="pointer-events-none absolute size-11 rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill opacity-45 shadow-[0_6px_18px_rgba(7,42,58,0.25)]"
          [style.left.px]="cluster.x"
          [style.top.px]="cluster.y"
          [style.translate]="'-50% -50%'"
          [style.transform]="'translate(9px, -9px)'"
          aria-hidden="true"
        ></span>
        <span
          class="pointer-events-none absolute size-11 rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill opacity-70 shadow-[0_6px_18px_rgba(7,42,58,0.3)]"
          [style.left.px]="cluster.x"
          [style.top.px]="cluster.y"
          [style.translate]="'-50% -50%'"
          [style.transform]="'translate(4.5px, -4.5px)'"
          aria-hidden="true"
        ></span>
        <button
          type="button"
          appTouchTarget
          class="pointer-events-auto absolute inline-flex size-11 touch-manipulation items-center justify-center rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill text-[17px] leading-none font-bold text-riv-solid-btn-ink tabular-nums shadow-[0_6px_18px_rgba(7,42,58,0.35)]"
          [style.left.px]="cluster.x"
          [style.top.px]="cluster.y"
          [style.translate]="'-50% -50%'"
          [attr.aria-label]="cluster.members.length + ' venues here, show them'"
          aria-expanded="false"
          (click)="fan(cluster)"
        >
          {{ cluster.members.length }}
        </button>
      }
    }
  `,
})
export class VariantStackFan {
  readonly clusters = input.required<readonly PinCluster[]>();
  readonly selected = input<string | null>(null);
  readonly chosen = output<string>();

  protected readonly disc = MAP_CHROME_DISC;

  /** Which cluster is fanned, by key — so a camera move that changes the membership restacks it. */
  protected readonly openKey = signal<string | null>(null);

  protected readonly open = computed(() =>
    this.clusters().find((cluster) => cluster.key === this.openKey()),
  );

  protected readonly spokes = computed(() => {
    const cluster = this.open();
    return cluster
      ? this.fanned(cluster).map((member) => ({ id: member.pin.id, x: member.x, y: member.y }))
      : [];
  });

  /** Escape restacks wherever it is pressed, matching how the preview card already closes. */
  restack(): void {
    this.openKey.set(null);
  }

  protected fan(cluster: PinCluster): void {
    this.openKey.set(cluster.key);
  }

  protected fanned(cluster: PinCluster): readonly PlacedPin[] {
    const offsets = fanOffsets(cluster.members.length, 62);
    return cluster.members.map((member, index) => ({
      pin: member.pin,
      x: cluster.x + offsets[index].x,
      y: cluster.y + offsets[index].y,
    }));
  }

  protected label(member: PlacedPin): string {
    return `${member.pin.card.name}, ${member.pin.card.beach}`;
  }
}
