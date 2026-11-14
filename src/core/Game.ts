import * as THREE from 'three';
import { EventBus } from './EventBus';
import { SimulationRunner } from './SimulationRunner';
import { GameLoop } from './GameLoop';
import { InputController } from './InputController';
import { Terrain } from '../planet/Terrain';
import { Mars } from '../planet/Mars';
import { CameraController } from '../planet/CameraController';
import { FogOfWar } from '../planet/FogOfWar';
import { SETTLEMENT } from '../data/settlement';
import { SettlementManager } from '../settlement/SettlementManager';
import { loadBuildingModels } from '../settlement/buildings/glbModels';
import { renderBuildingThumbnails } from '../settlement/buildings/thumbnails';
import { SaveManager } from '../persistence/SaveManager';
import { LocalPrefs } from '../persistence/LocalPrefs';
import { gameStore, regionManager, watch } from '../state/gameStore';
import type { PanelId } from '../state/types';
import { HUD } from '../ui/HUD';
import { SidePanel } from '../ui/SidePanel';
import { ConstructionMenu } from '../ui/ConstructionMenu';
import { ExplorationPanel } from '../ui/ExplorationPanel';
import { MissionsPanel, ResearchPanel, SettlementPanel } from '../ui/InfoPanels';
import { BuildingPanel } from '../ui/BuildingPanel';
import { Alerts } from '../ui/Alerts';
import { PlacementHint, Toolbar } from '../ui/Toolbar';
import { MapControls } from '../ui/MapControls';
import { MapLabels } from '../ui/MapLabels';
import { WorldPopups } from '../ui/WorldPopups';
import { LoadingScreen, WelcomeScreen } from '../ui/Screens';

const GLOBE_ALTITUDE = 235;
const BASE_ALTITUDE = 0.75;

/** Real-time seconds between autosaves (local + cloud). */
const AUTOSAVE_SECONDS = 60;

const PANEL_KEYS: Record<string, PanelId> = { b: 'construction', x: 'exploration', m: 'missions', t: 'research', i: 'settlement' };

/**
 * Composition root: creates every system, wires them together and runs the frame loop.
 */
export class Game {
  private events = new EventBus();
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private sun = new THREE.DirectionalLight('#fff1e0', 2.7);
  private camera!: CameraController;
  private mars!: Mars;
  private fog!: FogOfWar;
  private settlement!: SettlementManager;
  private input!: InputController;
  private sim = new SimulationRunner(this.events);
  private saves = new SaveManager();
  private labels!: MapLabels;
  private popups!: WorldPopups;
  private mapControls!: MapControls;
  private loop = new GameLoop((dt, t) => this.frame(dt, t));
  private width = 1;
  private height = 1;
  private lastRegionHover = -2;
  private saving = false;
  private readonly tmp = new THREE.Vector3();
  private readonly lightDir = new THREE.Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    private ui: HTMLElement,
  ) {}

  async init(): Promise<void> {
    const loading = new LoadingScreen(this.ui);
    let terrain: Terrain;
    try {
      terrain = await Terrain.load((f, label) => loading.progress(f * 0.92, label));
    } catch (err) {
      console.error(err);
      loading.error('Could not generate the planet. Please reload the page.');
      return;
    }
    loading.progress(0.95, 'Building the settlement');
    await nextFrame();

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    // Render the shadow map at least once so shadow samplers always have a valid depth texture.
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.background = new THREE.Color('#05060a');

    // Lighting: a key light that follows the view (so the side you look at is lit,
    // like a classic shaded-relief map) plus a warm sky / dark ground fill.
    this.scene.add(new THREE.HemisphereLight('#ffe2c4', '#2a140c', 0.85));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -0.55;
    sc.right = sc.top = 0.55;
    sc.near = 0.5;
    sc.far = 8;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.0012;
    this.scene.add(this.sun, this.sun.target);

    loading.progress(0.96, 'Unpacking building models');
    await loadBuildingModels(this.renderer, (f) => loading.progress(0.96 + f * 0.03, 'Unpacking building models'));
    renderBuildingThumbnails(this.renderer);

    this.mars = new Mars(terrain);
    this.scene.add(this.mars.group);
    this.fog = new FogOfWar(this.mars.uniforms);
    this.settlement = new SettlementManager(terrain, this.events);
    this.scene.add(this.settlement.group);

    this.camera = new CameraController(terrain, this.canvas);
    this.input = new InputController(this.canvas, this.camera, {
      onClick: (x, y) => this.handleClick(x, y),
      onSecondaryClick: () => this.handleCancel(),
      onKey: (k, e) => this.handleKey(k, e),
      paintMode: () => gameStore.getState().roadMode,
      onPaint: (x, y, start) => this.settlement.roadPlacement.paint(this.camera.pickSurface(x, y), start),
      onPaintEnd: (commit) => this.settlement.roadPlacement.endStroke(commit),
    });

    this.buildUI(terrain);
    this.wireState();
    this.wirePersistence();
    this.sim.refresh();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Compile shaders up front so the first frames don't stutter.
    this.renderer.compile(this.scene, this.camera.camera);
    this.loop.start();
    loading.progress(1, 'Ready');
    loading.hide();

    new WelcomeScreen(
      this.ui,
      () => {
        gameStore.getState().start();
        this.events.emit('camera:home');
      },
      this.saves.info().then((i) => !!i),
      () => this.loadSaved(),
    );
  }

  private buildUI(terrain: Terrain): void {
    const ui = this.ui;
    this.labels = new MapLabels(ui, terrain, this.events);
    this.popups = new WorldPopups(ui, this.events, terrain, this.settlement.grid);
    new HUD(ui, this.events);
    new Alerts(ui);
    new SidePanel(ui, [
      new ConstructionMenu(),
      new ExplorationPanel(this.events),
      new MissionsPanel(),
      new ResearchPanel(),
      new SettlementPanel(this.events, this.saves, () => this.afterLoad()),
    ]);
    new BuildingPanel(ui, this.events);
    new PlacementHint(ui, this.events);
    new Toolbar(ui);
    this.mapControls = new MapControls(ui, this.events, this.camera);
  }

  private wireState(): void {
    let first = true;
    watch(
      (s) => s.discoveredRegions,
      (d) => {
        this.fog.setDiscovered(d, first);
        first = false;
      },
    );
    watch(
      (s) => s.selectedRegionId,
      (id) => this.fog.setSelected(id ? (regionManager.get(id)?.index ?? -1) : -1),
    );
    this.events.on('camera:flyTo', ({ lat, lon, altitude }) => this.camera.flyTo(lat, lon, altitude));
    this.events.on('camera:home', () => this.camera.flyTo(SETTLEMENT.lat, SETTLEMENT.lon, BASE_ALTITUDE));
    this.events.on('camera:globe', () => this.camera.flyTo(this.camera.lat, this.camera.lon, GLOBE_ALTITUDE));
    this.events.on('region:discovered', ({ id }) => {
      if (gameStore.getState().activePanel === 'exploration') gameStore.getState().selectRegion(id);
    });
  }

  /** Autosave to IndexedDB + Supabase, and remember small view prefs in localStorage. */
  private wirePersistence(): void {
    watch(
      (s) => s.activePanel,
      (panel) => {
        if (gameStore.getState().started) LocalPrefs.set('lastPanel', panel);
      },
    );
    window.setInterval(() => this.autosave(), AUTOSAVE_SECONDS * 1000);
    const flush = () => {
      this.rememberCamera();
      this.autosave();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  private rememberCamera(): void {
    if (!gameStore.getState().started) return;
    LocalPrefs.set('camera', { lat: this.camera.lat, lon: this.camera.lon, alt: this.camera.alt });
  }

  private async autosave(): Promise<void> {
    const s = gameStore.getState();
    if (!s.started || this.saving || LocalPrefs.get('autosave') === false) return;
    this.saving = true;
    try {
      this.rememberCamera();
      await this.saves.save(s);
    } catch (e) {
      console.warn('Autosave failed', e);
    } finally {
      this.saving = false;
    }
  }

  private async loadSaved(): Promise<void> {
    try {
      const state = await this.saves.load();
      if (state) {
        gameStore.getState().replaceState({ ...state, paused: false });
        this.afterLoad();
        const cam = LocalPrefs.get('camera');
        const panel = LocalPrefs.get('lastPanel');
        if (panel) gameStore.getState().openPanel(panel);
        if (cam && Number.isFinite(cam.lat) && Number.isFinite(cam.lon) && Number.isFinite(cam.alt)) {
          this.camera.flyTo(cam.lat, cam.lon, cam.alt);
          return;
        }
      } else {
        gameStore.getState().start();
      }
    } catch (e) {
      console.warn('Load failed', e);
      gameStore.getState().start();
    }
    this.events.emit('camera:home');
  }

  private afterLoad(): void {
    this.fog.setDiscovered(gameStore.getState().discoveredRegions, true);
    this.sim.refresh();
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  private handleClick(x: number, y: number): void {
    const s = gameStore.getState();
    if (s.roadMode) {
      this.settlement.roadPlacement.click(this.camera.pickSurface(x, y));
      return;
    }
    if (s.construction.active) {
      this.settlement.placement.hover(this.camera.pickSurface(x, y));
      this.settlement.placement.confirm();
      return;
    }
    if (this.camera.alt < 8) {
      const id = this.settlement.buildings.pick(this.camera.getRay(x, y));
      if (id) {
        s.selectBuilding(id);
        return;
      }
    }
    if (s.selectedBuildingId) s.selectBuilding(null);
    if (this.camera.alt >= 6) {
      const hit = this.camera.pickSurface(x, y);
      if (hit) {
        const region = regionManager.at(hit.lat, hit.lon);
        s.selectRegion(region.id);
        s.openPanel('exploration');
      }
    }
  }

  private handleCancel(): boolean {
    const s = gameStore.getState();
    if (s.roadMode) {
      s.stopRoadMode();
      return true;
    }
    if (s.construction.active) {
      s.cancelPlacement();
      return true;
    }
    if (s.selectedBuildingId) {
      s.selectBuilding(null);
      return true;
    }
    if (s.activePanel) {
      s.openPanel(null);
      return true;
    }
    return false;
  }

  private handleKey(key: string, e: KeyboardEvent): boolean {
    const s = gameStore.getState();
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    switch (key) {
      case 'escape':
        return this.handleCancel();
      case ' ':
        if (s.started) s.togglePause();
        return true;
      case '1':
        s.setSpeed(1);
        return true;
      case '2':
        s.setSpeed(2);
        return true;
      case '3':
      case '4':
        s.setSpeed(4);
        return true;
      case 'r':
        s.rotatePlacement();
        return s.construction.active;
      case 'n':
        if (s.roadMode) s.stopRoadMode();
        else {
          const res = s.startRoadMode();
          if (!res.ok) s.pushAlert({ key: 'cant-afford', level: 'warning', title: 'Not enough regolith for roads', message: res.reason });
        }
        return true;
      case 'h':
        this.events.emit('camera:home');
        return true;
      case 'g':
        this.events.emit('camera:globe');
        return true;
    }
    const panel = PANEL_KEYS[key];
    if (panel) {
      s.togglePanel(panel);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.camera.resize(this.width, this.height);
  }

  private frame(dt: number, time: number): void {
    this.sim.frame(dt);

    this.input.update(dt);
    this.camera.update(dt);
    const cam = this.camera.camera;
    const alt = this.camera.alt;

    this.updateHover();
    this.fog.update(dt);
    this.mars.update(cam.position, alt);
    this.settlement.update(dt, time, alt, cam.position);
    this.updateLight(alt);

    this.labels.update(cam, alt, this.width, this.height);
    this.popups.update(cam, alt, this.width, this.height, dt);
    this.mapControls.update();
    this.renderer.render(this.scene, cam);
  }

  private updateHover(): void {
    const h = this.input.hover;
    if (!h || !h.dirty) return;
    h.dirty = false;
    const hit = this.camera.pickSurface(h.x, h.y);
    if (this.settlement.placement.active) this.settlement.placement.hover(hit);
    this.settlement.roadPlacement.hover(hit);
    if (!hit) {
      this.events.emit('pointer:surface', null);
      if (this.lastRegionHover !== -1) this.fog.setHover((this.lastRegionHover = -1));
      return;
    }
    const region = regionManager.at(hit.lat, hit.lon);
    this.events.emit('pointer:surface', { lat: hit.lat, lon: hit.lon, regionId: region.id });
    const idx = this.camera.alt >= 6 ? region.index : -1;
    if (idx !== this.lastRegionHover) this.fog.setHover((this.lastRegionHover = idx));
  }

  private updateLight(alt: number): void {
    const m = this.camera.camera.matrixWorld.elements;
    // camera right = column 0, up = column 1, back = column 2
    this.lightDir
      .set(-m[0] * 0.5 + m[4] * 0.6 + m[8] * 0.75, -m[1] * 0.5 + m[5] * 0.6 + m[9] * 0.75, -m[2] * 0.5 + m[6] * 0.6 + m[10] * 0.75)
      .normalize();
    const c = this.settlement.center;
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(this.lightDir, 4);
    this.sun.target.updateMatrixWorld();
    const nearBase = alt < 6 && this.settlement.distanceFrom(this.tmp.copy(this.camera.camera.position)) < 4;
    if (nearBase) this.renderer.shadowMap.needsUpdate = true;
  }
}

/** Yields so the loading screen can repaint (setTimeout also works in background tabs). */
function nextFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 30));
}

