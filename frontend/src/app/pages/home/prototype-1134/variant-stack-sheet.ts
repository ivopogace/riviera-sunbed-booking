import { Component, computed, input, output, signal } from '@angular/core';

import { CardGlass } from '../../../shared/card-glass';
import { TouchTarget } from '../../../shared/touch-target';
import { MAP_CHROME_DISC, PinCluster, pinFaceClass, pinFaceText, PlacedPin } from './pin-crowding';

/**
 * THROWAWAY PROTOTYPE — variant B, **Stack sheet**.
 *
 * <p>Nothing on the map moves or merges: every pin stays exactly where its venue is, overlapping
 * and all. What changes is what a press RESOLVES TO. A crowd carries one hit target over the whole
 * blob, and pressing it answers with a set rather than a venue — a sheet of full-width rows, each
 * far past the 44 px floor, where a thumb has room it never has on a map.
 *
 * <p>The argument: it answers the report as reported ("you cannot choose between those two if you
 * have bigger fingers") and asks nothing of map geometry — no marker is re-added, re-ordered or
 * displaced, so the rebuild-detaches-focus constraint never comes up. The cost: the choice happens
 * off the map, in a list, which is the surface the tourist opened the map to get away from.
 */
@Component({
  selector: 'app-variant-stack-sheet',
  imports: [CardGlass, TouchTarget],
  host: { class: 'contents' },
  template: `
    @for (cluster of clusters(); track cluster.key) {
      @for (member of cluster.members; track member.pin.id) {
        <span
          class="pointer-events-none absolute"
          [class]="disc"
          [style.left.px]="member.x"
          [style.top.px]="member.y"
          [style.translate]="'-50% -50%'"
          aria-hidden="true"
          ><span [class]="face(member)">{{ faceText(member) }}</span></span
        >
      }
      <button
        type="button"
        appTouchTarget
        class="pointer-events-auto absolute rounded-full focus-visible:outline-offset-4"
        [style.left.px]="cluster.x"
        [style.top.px]="cluster.y"
        [style.width.px]="hitSize(cluster)"
        [style.height.px]="hitSize(cluster)"
        [style.translate]="'-50% -50%'"
        [attr.aria-label]="hitLabel(cluster)"
        [attr.aria-expanded]="cluster.members.length > 1 ? openKey() === cluster.key : null"
        (click)="press(cluster)"
      ></button>
      @if (cluster.members.length > 1) {
        <span
          class="pointer-events-none absolute inline-flex min-w-[26px] items-center justify-center rounded-full border-2 border-riv-solid-btn-fill bg-riv-solid-btn-ink px-[6px] py-[2px] text-[13px] leading-[15px] font-bold text-riv-solid-btn-fill tabular-nums"
          [style.left.px]="cluster.x + 15"
          [style.top.px]="cluster.y - 17"
          aria-hidden="true"
          >{{ cluster.members.length }}</span
        >
      }
    }

    @if (open(); as cluster) {
      <!-- Off the imagery and onto the app's own glass: this is a list, not map chrome. -->
      <div
        appCardGlass
        class="pointer-events-auto absolute inset-x-3 bottom-[58px] overflow-hidden rounded-[22px] shadow-[0_16px_44px_rgba(7,42,58,0.32),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[26px] backdrop-saturate-[1.7] motion-safe:transition-opacity motion-safe:starting:opacity-0"
        role="dialog"
        aria-labelledby="prototype-stack-sheet-heading"
      >
        <div class="flex items-center gap-2 py-[10px] pr-[10px] pl-[18px]">
          <h2
            id="prototype-stack-sheet-heading"
            class="flex-1 text-[15px] leading-[1.3] font-bold text-riv-card-ink"
          >
            {{ cluster.members.length }} venues at this spot
          </h2>
          <button
            type="button"
            appTouchTarget
            class="inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full text-[19px] leading-none text-riv-card-ink hover:bg-riv-card-track"
            aria-label="Close this list"
            (click)="close()"
          >
            <span aria-hidden="true">&#x00d7;</span>
          </button>
        </div>
        <ul class="max-h-[248px] overflow-y-auto scrollbar-thin">
          @for (member of cluster.members; track member.pin.id) {
            <li class="border-t border-riv-card-track">
              <button
                type="button"
                appTouchTarget
                class="flex w-full touch-manipulation items-center gap-3 px-[18px] py-[11px] text-left hover:bg-riv-card-track focus-visible:outline-offset-[-3px]"
                [attr.aria-label]="rowLabel(member.pin.card)"
                (click)="choose(member.pin.id)"
              >
                <span class="min-w-0 flex-1" aria-hidden="true">
                  <span
                    class="block truncate text-[15px] leading-[1.25] font-bold text-riv-card-ink"
                    >{{ member.pin.card.name }}</span
                  >
                  <span class="mt-[2px] block text-[12.5px] text-riv-card-ink-faint"
                    >{{ member.pin.card.free }} of {{ member.pin.card.total }} sets free</span
                  >
                </span>
                <span class="shrink-0 text-right" aria-hidden="true">
                  @if (member.pin.card.priceLabel; as price) {
                    <span class="block text-[15px] font-extrabold text-riv-accent-ink">{{
                      price
                    }}</span>
                    <span class="block text-[11px] text-riv-card-ink-faint">per set</span>
                  } @else {
                    <span class="block text-[12.5px] text-riv-card-ink-faint">No sets yet</span>
                  }
                </span>
              </button>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class VariantStackSheet {
  readonly clusters = input.required<readonly PinCluster[]>();
  readonly selected = input<string | null>(null);
  readonly chosen = output<string>();

  protected readonly disc = MAP_CHROME_DISC;

  protected readonly openKey = signal<string | null>(null);

  protected readonly open = computed(() =>
    this.clusters().find((cluster) => cluster.key === this.openKey()),
  );

  close(): void {
    this.openKey.set(null);
  }

  /** The blob's own width, never below the widest pill — a two-pin crowd is still one target. */
  protected hitSize(cluster: PinCluster): number {
    const spread = Math.max(
      ...cluster.members.map((member) => Math.hypot(member.x - cluster.x, member.y - cluster.y)),
    );
    return Math.max(cluster.width, Math.round(spread * 2 + cluster.width));
  }

  protected face(member: PlacedPin): string {
    return pinFaceClass(member.pin);
  }

  protected faceText(member: PlacedPin): string {
    return pinFaceText(member.pin);
  }

  protected hitLabel(cluster: PinCluster): string {
    const [only] = cluster.members;
    return cluster.members.length === 1
      ? `${only.pin.card.name}, ${only.pin.card.beach}`
      : `${cluster.members.length} venues at this spot, choose one`;
  }

  protected rowLabel(card: PinCluster['members'][number]['pin']['card']): string {
    const price = card.priceLabel ? `, from ${card.priceLabel} per set` : '';
    return `${card.name}, ${card.beach}${price}, ${card.free} of ${card.total} sets free`;
  }

  protected press(cluster: PinCluster): void {
    if (cluster.members.length === 1) {
      this.chosen.emit(cluster.members[0].pin.id);
      return;
    }
    this.openKey.set(this.openKey() === cluster.key ? null : cluster.key);
  }

  protected choose(id: string): void {
    this.openKey.set(null);
    this.chosen.emit(id);
  }
}
