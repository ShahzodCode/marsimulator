import * as THREE from 'three';
import { BUILDINGS, type BuildingType } from '../data/buildings';
import { gameStore, roadSet } from '../state/gameStore';
import type { EventBus } from '../core/EventBus';
import type { SurfaceHit } from '../planet/CameraController';
import { checkPlacement, footprintRect, rectCenter, snapToGrid, PROBLEM_TEXT } from './PlacementRules';
import type { SettlementGrid } from './SettlementGrid';
import { buildBuildingModel } from './buildings/models';
import { createGhostMaterial } from './buildings/materials';
import { disposeGeometries } from './buildings/ModelBuilder';
import { ResourceManager } from '../simulation/ResourceManager';

const VALID = new THREE.Color('#58ff9a');
const VALID_EMISSIVE = new THREE.Color('#1d7a45');
const INVALID = new THREE.Color('#ff5a4f');
const INVALID_EMISSIVE = new THREE.Color('#8a1a14');

/**
 * Click-to-place construction: shows a transparent preview of the selected building
 * that snaps to the settlement grid on the curved surface, turns red when the spot is
 * invalid, and places the building on click.
 */
export class BuildingPlacement {
  readonly group = new THREE.Group();
  private ghostMaterial = createGhostMaterial();
  private padMaterial = new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.28, depthWrite: false });
  private ghost: THREE.Group | null = null;
  private pad: THREE.Mesh | null = null;
  private type: BuildingType | null = null;
  private rotation = 0;
  private gridX = 0;
  private gridY = 0;
  private valid = false;
  private hasPosition = false;
  private message: string | null = null;

  constructor(
    private grid: SettlementGrid,
    private events: EventBus,
  ) {
    this.group.name = 'placement-preview';
  }

  get active(): boolean {
    return this.type !== null;
  }

  setMode(type: BuildingType | null, rotation: number): void {
    if (type !== this.type) {
      this.clear();
      this.type = type;
      if (type) {
        const model = buildBuildingModel(type, this.ghostMaterial);
        this.ghost = new THREE.Group();
        this.ghost.add(model.group);
        const fp = BUILDINGS[type].footprint;
        this.pad = new THREE.Mesh(new THREE.PlaneGeometry(fp.width, fp.height).rotateX(-Math.PI / 2), this.padMaterial);
        this.pad.position.y = 0.16;
        this.pad.renderOrder = 3;
        this.ghost.add(this.pad);
        this.ghost.visible = false;
        this.group.add(this.ghost);
        this.hasPosition = false;
      }
    }
    if (rotation !== this.rotation) {
      this.rotation = rotation;
      if (this.hasPosition) this.refresh();
    }
  }

  /** Called on pointer move with the surface point under the cursor. */
  hover(hit: SurfaceHit | null): void {
    if (!this.type || !this.ghost) return;
    const g = hit ? this.grid.latLonToGrid(hit.lat, hit.lon) : null;
    if (!g) {
      this.ghost.visible = false;
      this.hasPosition = false;
      this.events.emit('placement:feedback', { valid: false, message: 'Point at the base to place the building.' });
      return;
    }
    const snapped = snapToGrid(this.type, this.rotation, g.x, g.y);
    if (this.hasPosition && snapped.gridX === this.gridX && snapped.gridY === this.gridY) return;
    this.gridX = snapped.gridX;
    this.gridY = snapped.gridY;
    this.hasPosition = true;
    this.refresh();
  }

  private refresh(): void {
    if (!this.type || !this.ghost) return;
    // Rotation may have changed the footprint; re-snap around the same centre.
    const state = gameStore.getState();
    const problem = checkPlacement(this.type, this.gridX, this.gridY, this.rotation, state.buildings, roadSet(state.roads));
    const cost = BUILDINGS[this.type].constructionCost;
    const affordable = ResourceManager.canAfford(state.resources, cost);
    this.valid = !problem && affordable;
    this.message = problem ? PROBLEM_TEXT[problem] : affordable ? null : ResourceManager.describeMissing(state.resources, cost);
    const c = rectCenter(footprintRect(this.type, this.gridX, this.gridY, this.rotation));
    this.grid.place(this.ghost, c.x, c.y, (this.rotation * Math.PI) / 2, 0.0004);
    this.ghost.visible = true;
    this.ghostMaterial.color.copy(this.valid ? VALID : INVALID);
    this.ghostMaterial.emissive.copy(this.valid ? VALID_EMISSIVE : INVALID_EMISSIVE);
    this.padMaterial.color.copy(this.valid ? VALID : INVALID);
    this.events.emit('placement:feedback', { valid: this.valid, message: this.message });
  }

  /** Attempts to place at the current preview position. Returns true when placed. */
  confirm(): boolean {
    if (!this.type || !this.hasPosition) return false;
    const res = gameStore.getState().placeBuilding({
      type: this.type,
      gridX: this.gridX,
      gridY: this.gridY,
      rotation: this.rotation,
    });
    if (!res.ok) {
      this.refresh();
      gameStore.getState().pushAlert({ key: 'placement-error', level: 'warning', title: 'Can’t build here', message: res.reason });
      return false;
    }
    return true;
  }

  update(time: number): void {
    if (this.ghost?.visible) this.ghostMaterial.opacity = 0.38 + 0.12 * Math.sin(time * 5);
  }

  private clear(): void {
    if (this.ghost) {
      this.group.remove(this.ghost);
      disposeGeometries(this.ghost);
      this.ghost = null;
      this.pad = null;
    }
    this.type = null;
    this.hasPosition = false;
  }
}
