import type {
  LngLat,
  MapEventName,
  MapHandle,
  MapImagery,
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
 * A {@link MapHandle} over a still image: the poster the sheet opens on, centred across the pane
 * and anchored to its top. `project` is Web Mercator around the poster's own centre, so a pin lands
 * where the live map puts it once it takes over at {@link PosterHandle.liveView}. A picture cannot
 * move: `easeTo`, `zoomIn`, `zoomOut` and `setView` report the wanted view through `onWanted` and
 * change nothing, so the page can swap the live map in and replay the move. Markers are held, never
 * drawn; click and drag subscriptions never fire (the ground button over the poster owns the tap).
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

  /**
   * A still is a picture the page holds, not pixels this handle owns: it never asked a renderer
   * for a readable buffer and cannot read a cross-origin-safe `<img>` back without one. The live
   * map that takes over is what answers.
   */
  readImagery(): MapImagery | null {
    return null;
  }

  private origin(): ScreenPoint {
    return { x: this.paneWidth / 2, y: this.posterHeight / 2 };
  }

  /** The inverse of {@link PosterHandle.project}: a spot on the poster back to a position. */
  unproject(point: ScreenPoint): LngLat {
    return unprojectAround(this.camera, this.origin(), point);
  }
}
