import type {
  LngLat,
  MapEventName,
  MapHandle,
  MapMarker,
  MapView,
  ScreenPoint,
} from './map-engine';
import { projectAround, unprojectAround } from './web-mercator';

/** A pane's box in CSS px — the ground the poster is centred in. */
export interface PaneBox {
  readonly width: number;
  readonly height: number;
}

/**
 * A {@link MapHandle} over a still image: the poster the sheet opens on. The still is centred in
 * the pane horizontally and anchored to its top, so `project` is Web Mercator arithmetic around
 * the poster's own centre — the pane's middle across, the poster's middle down — and a pin lands
 * on the picture where the live map will put it once it takes over at {@link PosterHandle.liveView}.
 *
 * <p>A picture cannot move: `easeTo`, `zoomIn`, `zoomOut` and `setView` report the view wanted
 * through `onWanted` and change nothing, so the page can swap the live map in and replay the move.
 * Markers are held but never drawn, and the click and drag subscriptions never fire — the ground
 * button over the poster owns the tap.
 */
export class PosterHandle implements MapHandle {
  private readonly moveHandlers = new Set<() => void>();
  private readonly clickHandlers = new Set<(at: LngLat) => void>();
  private readonly dragEndHandlers = new Set<(id: string, at: LngLat) => void>();
  private readonly markerSet = new Map<string, MapMarker>();
  private destroyed = false;

  constructor(
    private readonly camera: MapView,
    private readonly paneWidth: number,
    private readonly posterHeight: number,
    private readonly onWanted: (view: MapView) => void,
  ) {}

  view(): MapView {
    return this.camera;
  }

  /** The live map's view for the same picture: the geography at the pane's centre, at the poster's zoom. */
  liveView(pane: PaneBox): MapView {
    return {
      center: this.unproject({ x: pane.width / 2, y: pane.height / 2 }),
      zoom: this.camera.zoom,
    };
  }

  markers(): ReadonlyMap<string, MapMarker> {
    return this.markerSet;
  }

  setView(view: MapView): void {
    this.onWanted(view);
  }

  easeTo(view: MapView): void {
    this.onWanted(view);
  }

  zoomIn(): void {
    this.onWanted({ ...this.camera, zoom: this.camera.zoom + 1 });
  }

  zoomOut(): void {
    this.onWanted({ ...this.camera, zoom: this.camera.zoom - 1 });
  }

  addMarker(marker: MapMarker): void {
    this.markerSet.set(marker.id, marker);
  }

  moveMarker(id: string, lngLat: LngLat): void {
    const marker = this.markerSet.get(id);
    if (marker) {
      this.markerSet.set(id, { ...marker, lngLat });
    }
  }

  removeMarker(id: string): void {
    this.markerSet.delete(id);
  }

  project(at: LngLat): ScreenPoint {
    return projectAround(this.camera, this.origin(), at);
  }

  onMove(handler: () => void): () => void {
    this.moveHandlers.add(handler);
    return () => this.moveHandlers.delete(handler);
  }

  /** A picture is loaded the moment anyone asks — but never synchronously, like a real map. */
  on(event: MapEventName, handler: () => void): () => void {
    let live = true;
    if (event === 'load') {
      queueMicrotask(() => {
        if (live && !this.destroyed) {
          handler();
        }
      });
    }
    return () => {
      live = false;
    };
  }

  onMapClick(handler: (at: LngLat) => void): () => void {
    this.clickHandlers.add(handler);
    return () => this.clickHandlers.delete(handler);
  }

  onMarkerDragEnd(handler: (id: string, at: LngLat) => void): () => void {
    this.dragEndHandlers.add(handler);
    return () => this.dragEndHandlers.delete(handler);
  }

  destroy(): void {
    this.destroyed = true;
    this.moveHandlers.clear();
    this.clickHandlers.clear();
    this.dragEndHandlers.clear();
    this.markerSet.clear();
  }

  private origin(): ScreenPoint {
    return { x: this.paneWidth / 2, y: this.posterHeight / 2 };
  }

  private unproject(point: ScreenPoint): LngLat {
    return unprojectAround(this.camera, this.origin(), point);
  }
}
