import { Component, computed, input, output } from '@angular/core';

import { TouchTarget } from '../../../shared/touch-target';
import {
  fanOffsets,
  MAP_CHROME_DISC,
  PinCluster,
  pinFaceClass,
  pinFaceText,
  PlacedPin,
} from './pin-crowding';

/** One crowd, already displaced: where each pin is drawn, and the true point it belongs to. */
interface Fan {
  readonly key: string;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly pins: readonly PlacedPin[];
  readonly tethered: boolean;
}

/**
 * THROWAWAY PROTOTYPE — variant C, **Tethered fan**.
 *
 * <p>No count, no sheet, no second press. A crowd is simply pushed apart: each pin slides out onto
 * a ring far enough that the next one clears a finger, and a hairline tether ties it back to the
 * true point it was moved off. Every venue is visible and pressable at every zoom, first press.
 * Zoom in and the crowd stops being a crowd, the ring dissolves, and the pins settle onto their
 * real coordinates — the treatment appears and disappears on its own.
 *
 * <p>The argument: it adds no vocabulary the tourist has to learn, and one press still buys one
 * venue. The cost: a displaced pin is lying about where its venue is, and the tether is the only
 * thing admitting it.
 */
@Component({
  selector: 'app-variant-tethered-fan',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `
    <svg class="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      @for (fan of fans(); track fan.key) {
        @if (fan.tethered) {
          @for (pin of fan.pins; track pin.pin.id) {
            <line
              [attr.x1]="fan.anchorX"
              [attr.y1]="fan.anchorY"
              [attr.x2]="pin.x"
              [attr.y2]="pin.y"
              stroke="var(--riv-solid-btn-ink)"
              stroke-width="1.5"
              stroke-opacity="0.55"
              stroke-linecap="round"
            />
          }
          <circle
            [attr.cx]="fan.anchorX"
            [attr.cy]="fan.anchorY"
            r="3.5"
            fill="var(--riv-solid-btn-ink)"
            stroke="var(--riv-solid-btn-fill)"
            stroke-width="2"
          />
        }
      }
    </svg>

    @for (fan of fans(); track fan.key) {
      @for (pin of fan.pins; track pin.pin.id) {
        <button
          type="button"
          appTouchTarget
          [class]="disc"
          class="pointer-events-auto absolute motion-safe:[transition:left_0.18s_ease-out,top_0.18s_ease-out]"
          [style.left.px]="pin.x"
          [style.top.px]="pin.y"
          [style.translate]="'-50% -50%'"
          [attr.aria-label]="label(pin, fan)"
          [attr.aria-expanded]="selected() === pin.pin.id"
          (click)="chosen.emit(pin.pin.id)"
        >
          <span aria-hidden="true" [class]="face(pin)">{{ faceText(pin) }}</span>
        </button>
      }
    }
  `,
})
export class VariantTetheredFan {
  readonly clusters = input.required<readonly PinCluster[]>();
  readonly selected = input<string | null>(null);
  readonly chosen = output<string>();

  protected readonly disc = MAP_CHROME_DISC;

  protected readonly fans = computed<readonly Fan[]>(() =>
    this.clusters().map((cluster) => {
      if (cluster.members.length === 1) {
        return {
          key: cluster.key,
          anchorX: cluster.x,
          anchorY: cluster.y,
          pins: cluster.members,
          tethered: false,
        };
      }
      const offsets = fanOffsets(cluster.members.length, 30, cluster.width);
      return {
        key: cluster.key,
        anchorX: cluster.x,
        anchorY: cluster.y,
        tethered: true,
        pins: cluster.members.map((member, index) => ({
          pin: member.pin,
          width: member.width,
          x: cluster.x + offsets[index].x,
          y: cluster.y + offsets[index].y,
        })),
      };
    }),
  );

  /** A displaced pin says so, so nobody reads the ring as the venue's real position. */
  protected label(pin: PlacedPin, fan: Fan): string {
    const moved = fan.tethered ? ', moved clear of a crowded spot' : '';
    return `${pin.pin.card.name}, ${pin.pin.card.beach}${moved}`;
  }

  protected face(pin: PlacedPin): string {
    return pinFaceClass(pin.pin);
  }

  protected faceText(pin: PlacedPin): string {
    return pinFaceText(pin.pin);
  }
}
