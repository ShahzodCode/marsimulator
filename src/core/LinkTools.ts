import type { EventBus } from './EventBus';
import type { CameraController, SurfaceHit } from '../planet/CameraController';
import type { LogisticsView } from '../planet/LogisticsView';
import { angularDistance, MARS_RADIUS_KM, R, type LatLon } from '../planet/geo';
import { describeCost, Logistics } from '../simulation/Logistics';
import { gameStore } from '../state/gameStore';
import type { BaseData } from '../state/types';

/** Camera height for joining bases: far enough out to see bases ~2,000 km apart. */
export const LINK_ALTITUDE = 70;
const KM_PER_UNIT = MARS_RADIUS_KM / R;

/** What the garage arrow is pointing at while it is dragged. */
export interface ArrowFeedback {
  valid: boolean;
  label: string;
}

/**
 * The two "drag from base to base" tools:
 *  - the pipeline tool (works like the road tool, on the globe): press on a base with a
 *    Pump Station, drag onto another base, let go to lay the pipe;
 *  - the Cargo Garage arrow: drag it out of the garage onto the base its haulers should drive to.
 */
export class LinkTools {
  private stroke: { from: BaseData; to: BaseData | null } | null = null;
  /** Garage arrow being dragged: the garage's id and where it stands. */
  private arrow: { garageId: string; from: LatLon; to: BaseData | null } | null = null;

  constructor(
    private camera: CameraController,
    private view: LogisticsView,
    private events: EventBus,
  ) {}

  /** Nearest base under the pointer (within a few percent of the view), if any. */
  private snapBase(hit: SurfaceHit | null, ok: (b: BaseData) => boolean = () => true): BaseData | null {
    if (!hit) return null;
    const limit = Math.max(60, this.camera.viewHeightUnits * KM_PER_UNIT * 0.06);
    let best: BaseData | null = null;
    let bestKm = limit;
    for (const b of Logistics.allBases(gameStore.getState())) {
      if (!ok(b)) continue;
      const d = angularDistance(hit.lat, hit.lon, b.lat, b.lon) * MARS_RADIUS_KM;
      if (d < bestKm) {
        bestKm = d;
        best = b;
      }
    }
    return best;
  }

  private flyOut(): void {
    const b = gameStore.getState().base;
    if (this.camera.alt < LINK_ALTITUDE * 0.6) this.camera.flyTo(b.lat, b.lon, LINK_ALTITUDE);
  }

  // ---------------------------------------------------------------- pipeline tool

  /** The tool was switched on or off. */
  setPipelineMode(on: boolean): void {
    this.stroke = null;
    this.view.hidePreview();
    if (!on) return;
    this.flyOut();
    this.events.emit('placement:feedback', { valid: false, message: 'Press on a base that has a Pump Station and drag onto another base.' });
  }

  pipelinePaint(hit: SurfaceHit | null, start: boolean): void {
    const s = gameStore.getState();
    if (!s.pipelineMode) return;
    if (start) {
      const from = this.snapBase(hit, (b) => Logistics.hasPump(b.buildings));
      this.stroke = from ? { from, to: null } : null;
      if (!from) {
        const any = this.snapBase(hit);
        this.events.emit('placement:feedback', {
          valid: false,
          message: any ? `${any.name} has no Pipeline Pump Station yet. Start from a base that has one.` : 'Start the drag on a base that has a Pump Station.',
        });
        return;
      }
    }
    const st = this.stroke;
    if (!st || !hit) return;
    st.to = this.snapBase(hit, (b) => b.id !== st.from.id);
    const end = st.to ?? hit;
    if (!st.to) {
      this.view.showPreview(Logistics.pumpSpot(st.from), end, false);
      this.events.emit('placement:feedback', { valid: false, message: `From ${st.from.name}: drag onto another base.` });
      return;
    }
    const check = Logistics.checkPipeline(s, st.from.id, st.to.id);
    this.view.showPreview(Logistics.pumpSpot(st.from), Logistics.pumpSpot(st.to), check.ok);
    this.events.emit('placement:feedback', {
      valid: check.ok,
      message: check.ok
        ? `${st.from.name} ⇄ ${st.to.name}: ${Math.round(check.km).toLocaleString()} km · ${describeCost(check.cost)} · ready in ${check.buildSols.toFixed(1)} sols. Let go to build.`
        : check.reason,
    });
  }

  pipelineEnd(commit: boolean): void {
    const st = this.stroke;
    this.stroke = null;
    this.view.hidePreview();
    if (!commit || !st?.to) return;
    const store = gameStore.getState();
    const res = store.buildPipeline(st.from.id, st.to.id);
    if (!res.ok) store.pushAlert({ key: 'pipe-error', level: 'warning', title: 'Can’t lay this pipeline', message: res.reason });
    else this.events.emit('placement:feedback', { valid: true, message: 'Pipeline laid! Drag between two more bases, or press Done.' });
  }

  // ---------------------------------------------------------------- garage arrow

  garageDragStart(garageId: string): void {
    const s = gameStore.getState();
    const g = s.buildings.find((x) => x.id === garageId);
    if (!g) return;
    this.arrow = { garageId, from: Logistics.spotOf(s.base, g), to: null };
    this.flyOut();
  }

  garageDrag(hit: SurfaceHit | null): ArrowFeedback {
    const a = this.arrow;
    if (!a) return { valid: false, label: '' };
    const home = gameStore.getState().base.id;
    a.to = this.snapBase(hit, (b) => b.id !== home);
    if (a.to) this.view.showPreview(a.from, a.to, true);
    else if (hit) this.view.showPreview(a.from, hit, false);
    return a.to ? { valid: true, label: `→ ${a.to.name}` } : { valid: false, label: 'Drop it on another base' };
  }

  garageDragEnd(): void {
    const a = this.arrow;
    this.arrow = null;
    this.view.hidePreview();
    if (!a?.to) return;
    const store = gameStore.getState();
    const res = store.setGarageTarget(a.garageId, a.to.id);
    if (!res.ok) store.pushAlert({ key: 'garage-error', level: 'warning', title: 'Can’t send haulers there', message: res.reason });
  }
}
