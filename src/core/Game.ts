import * as THREE from 'three';
import { EventBus } from './EventBus';
import { SimulationRunner } from './SimulationRunner';
import { GameLoop } from './GameLoop';
import { GraphicsController } from './Graphics';
import { InputController } from './InputController';
import { Terrain } from '../planet/Terrain';
import { Mars } from '../planet/Mars';
import { CameraController } from '../planet/CameraController';
import { FogOfWar } from '../planet/FogOfWar';
import { RoverFleet } from '../planet/RoverFleet';
import { LogisticsView } from '../planet/LogisticsView';
import { LinkTools } from './LinkTools';
import { GarageArrow } from '../ui/GarageArrow';
import { footprintRect, rectCenter } from '../settlement/PlacementRules';
import { BASE_SITES, SITE_BY_ID, type TraitId } from '../data/baseSites';
import { DEPOSIT_KIND } from '../planet/Mars';
import { XrayControl } from '../ui/XrayControl';
import { BaseSwitcher } from '../ui/BaseSwitcher';
import { SettlementManager } from '../settlement/SettlementManager';
import { loadBuildingModels } from '../settlement/buildings/glbModels';
import { renderBuildingThumbnails } from '../settlement/buildings/thumbnails';
import { SaveManager } from '../persistence/SaveManager';
import { LocalPrefs } from '../persistence/LocalPrefs';
import { Auth, type AuthChange } from '../persistence/Auth';
import { createInitialState } from '../state/factory';
import { gameStore, regionManager, setRouteHeight, watch } from '../state/gameStore';
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
import { GuideBook } from '../ui/GuideBook';
import { MapLabels } from '../ui/MapLabels';
import { WorldPopups } from '../ui/WorldPopups';
import { LoadingScreen, WelcomeScreen } from '../ui/Screens';
import { PauseMenu } from '../ui/PauseMenu';
import { FpsCounter } from '../ui/FpsCounter';
import { Spectator } from './Spectator';
import { Visits } from './Visits';
import { onBeforeLanguageChange, t } from '../i18n';

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
  private fleet!: RoverFleet;
  private logistics!: LogisticsView;
  private links!: LinkTools;
  private garageArrow!: GarageArrow;
  /** One scene per base; the active base follows the store. */
  private settlements = new Map<string, SettlementManager>();
  private terrain!: Terrain;
  private input!: InputController;
  private sim = new SimulationRunner(this.events);
  private saves = new SaveManager();

  /** Whose colony is on screen: the account id, or null for a guest. */
  private owner: string | null = null;
  private labels!: MapLabels;
  private popups!: WorldPopups;
  private mapControls!: MapControls;
  /** Visiting another player's colony (spectate mode). */
  private spectator!: Spectator;
  private xray!: XrayControl;
  private guide!: GuideBook;
  private graphics!: GraphicsController;
  private loop = new GameLoop(
    (dt, t) => this.frame(dt, t),
    () => this.graphics?.frameInterval ?? 0,
  );
  private pauseMenu!: PauseMenu;
  private readonly lastLightDir = new THREE.Vector3();
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
      loading.error(t('Could not generate the planet. Please reload the page.'));
      return;
    }
    loading.progress(0.95, 'Building the settlement');
    await nextFrame();

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
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
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -0.55;
    sc.right = sc.top = 0.55;
    sc.near = 0.5;
    sc.far = 8;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.0012;
    this.scene.add(this.sun, this.sun.target);
    // Pixel ratio, shadow map size and shadows on/off come from the graphics settings.
    this.graphics = new GraphicsController(this.renderer, this.sun);

    loading.progress(0.96, 'Unpacking building models');
    await loadBuildingModels(this.renderer, (f) => loading.progress(0.96 + f * 0.03, 'Unpacking building models'));
    renderBuildingThumbnails(this.renderer);

    this.mars = new Mars(terrain);
    this.scene.add(this.mars.group);
    this.fog = new FogOfWar(this.mars.uniforms);
    setRouteHeight((lat, lon) => terrain.heightKm(lat, lon));
    this.fleet = new RoverFleet(terrain);
    this.scene.add(this.fleet.group);
    this.logistics = new LogisticsView(terrain);
    this.scene.add(this.logistics.group);
    this.terrain = terrain;
    this.syncBases();

    this.camera = new CameraController(terrain, this.canvas);
    this.input = new InputController(this.canvas, this.camera, {
      onClick: (x, y) => this.handleClick(x, y),
      onSecondaryClick: () => this.handleCancel(),
      onKey: (k, e) => this.handleKey(k, e),
      paintMode: () => gameStore.getState().roadMode || gameStore.getState().pipelineMode,
      onPaint: (x, y, start) => {
        const hit = this.camera.pickSurface(x, y);
        if (gameStore.getState().pipelineMode) this.links.pipelinePaint(hit, start);
        else this.settlement.roadPlacement.paint(hit, start);
      },
      onPaintEnd: (commit) => {
        if (gameStore.getState().pipelineMode) this.links.pipelineEnd(commit);
        else this.settlement.roadPlacement.endStroke(commit);
      },
    });
    this.links = new LinkTools(this.camera, this.logistics, this.events);

    this.buildUI(terrain);
    this.spectator = new Spectator({
      scene: this.scene,
      terrain,
      mars: this.mars,
      camera: this.camera,
      events: this.events,
      ui: this.ui,
      restoreOwnBases: () => this.syncBases(),
    });
    // The radar view is about your own colony: switch it off for a visit.
    Visits.onChange((v) => {
      if (v && this.xray.isOn) this.xray.toggle();
    });
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

    // The remembered sign-in (kept in localStorage by supabase-js) must be restored
    // before anything starts, or a fresh colony would autosave over the account's save.
    await Auth.ready;
    this.owner = Auth.current?.id ?? null;
    // Signed-in players resume their account's colony right away (e.g. after a page
    // refresh); guests see the briefing and always start a new one.
    if (Auth.current) {
      await this.loadSaved();
      return;
    }
    new WelcomeScreen(this.ui, async () => {
      await Auth.ready;
      if (Auth.current) {
        await this.loadSaved();
        return;
      }
      gameStore.getState().start();
      this.events.emit('camera:home');
    });
  }

  private buildUI(terrain: Terrain): void {
    const ui = this.ui;
    this.labels = new MapLabels(ui, terrain, this.events);
    this.popups = new WorldPopups(ui, this.events, terrain, () => this.settlement.grid);
    new HUD(ui, this.events);
    new BaseSwitcher(ui);
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
    new FpsCounter(ui);
    this.pauseMenu = new PauseMenu(ui, this.events);
    this.mapControls = new MapControls(ui, this.events, this.camera);
    this.xray = new XrayControl(ui, this.events);
    this.guide = new GuideBook(ui);
    this.garageArrow = new GarageArrow(ui, terrain, {
      worldOf: (id) => {
        const b = gameStore.getState().buildings.find((x) => x.id === id);
        if (!b) return null;
        const c = rectCenter(footprintRect(b.type, b.gridX, b.gridY, b.rotation));
        return this.settlement.grid.surfacePoint(c.x, c.y, 0.02);
      },
      start: (id) => this.links.garageDragStart(id),
      move: (x, y) => this.links.garageDrag(this.camera.pickSurface(x, y)),
      end: () => this.links.garageDragEnd(),
    });
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
    this.events.on('xray:set', (v) => {
      this.mars.setXray(v);
      // The radar view is a map view: pull back from close-up base views.
      if (v.on && this.camera.alt < 30) this.camera.flyTo(this.camera.lat, this.camera.lon, 140);
    });
    watch(
      (s) => `${Object.keys(s.sitesSeen).length}|${Object.values(s.discoveredRegions).filter(Boolean).length}|${s.research.completed.includes('orbiter_mk3')}`,
      () => this.mars.setDeposits(depositsFor(gameStore.getState())),
    );
    watch(
      (s) => s.pipelineMode,
      (on) => this.links.setPipelineMode(on),
      Object.is,
      false,
    );
    this.events.on('camera:flyTo', ({ lat, lon, altitude }) => this.camera.flyTo(lat, lon, altitude));
    this.events.on('camera:home', () => {
      // While visiting, Home means the visited base.
      const visit = Visits.current;
      const b = (visit && visit.colony.bases.find((x) => x.id === visit.baseId)) || gameStore.getState().base;
      this.camera.flyTo(b.lat, b.lon, BASE_ALTITUDE);
    });
    // Switching bases flies the camera there.
    watch(
      (s) => s.base.id,
      () => this.events.emit('camera:home'),
      Object.is,
      false,
    );
    watch(
      (s) => `${s.base.id}|${s.otherBases.map((b) => b.id).join(',')}`,
      () => this.syncBases(),
      Object.is,
      false,
    );
    watch(
      (s) => s.otherBases,
      (others) => {
        for (const b of others) this.settlements.get(b.id)?.showSnapshot(b.buildings, b.roads);
      },
    );
    this.events.on('camera:globe', () => this.camera.flyTo(this.camera.lat, this.camera.lon, GLOBE_ALTITUDE));
    for (const ev of ['region:discovered', 'region:explored'] as const) {
      this.events.on(ev, ({ id }) => {
        if (gameStore.getState().activePanel === 'exploration') gameStore.getState().selectRegion(id);
      });
    }
  }

  /** Autosave to IndexedDB + Supabase, and remember small view prefs in localStorage. */
  private wirePersistence(): void {
    watch(
      (s) => s.activePanel,
      (panel) => {
        if (gameStore.getState().started) LocalPrefs.set('lastPanel', panel);
      },
    );
    Auth.onChange((account, change) => {
      this.onAccountChange(account?.id ?? null, change).catch((e) => console.warn('Account switch failed', e));
    });
    window.setInterval(() => this.autosave(), AUTOSAVE_SECONDS * 1000);
    // Switching language reloads the page: save first so nothing is lost.
    onBeforeLanguageChange(() => this.autosave());
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

  /**
   * A guest who signs up or logs in mid-game keeps the colony they're playing: it is
   * saved to the account (unless logging in to an account that already has a colony,
   * which is loaded instead so it never gets overwritten). Logging out starts a new
   * guest colony. On the welcome screen nothing happens until "Start mission".
   */
  private async onAccountChange(owner: string | null, change: AuthChange): Promise<void> {
    if (change === 'update') return;
    Visits.stop();
    const prev = this.owner;
    this.owner = owner;
    const s = gameStore.getState();
    if (!s.started) return;
    // Keep a local copy of the colony for whoever was playing before the switch.
    if (prev !== owner) await this.saves.saveLocalFor(s, prev).catch(() => {});

    if (change === 'logout') {
      gameStore.getState().replaceState({ ...createInitialState(), started: true });
      this.afterLoad();
      this.events.emit('camera:home');
      gameStore.getState().pushAlert({ key: 'account', level: 'info', title: t('Logged out'), message: t('You are playing as a guest. Log in to save your colony.') });
      return;
    }

    const carryOver = prev === null && change === 'signup';
    const saved = carryOver ? null : await this.saves.load();
    if (saved) {
      gameStore.getState().replaceState({ ...saved, started: true, paused: false });
      this.afterLoad();
      this.events.emit('camera:home');
    }
    await this.autosave();
    const name = Auth.current?.username ?? t('your account');
    gameStore.getState().pushAlert({
      key: 'account',
      level: 'success',
      title: change === 'signup' ? t('Account created') : t('Welcome back, {name}!', { name }),
      message: saved ? t('Loaded the colony saved to {name}.', { name }) : t('Your colony now saves to {name}.', { name }),
    });
  }

  private afterLoad(): void {
    Visits.stop();
    this.fog.setDiscovered(gameStore.getState().discoveredRegions, true);
    this.sim.refresh();
  }

  /** The base on screen. */
  private get settlement(): SettlementManager {
    return this.settlements.get(gameStore.getState().base.id) ?? this.settlements.values().next().value!;
  }

  /** Makes sure every base has a scene, the right one is active, and the globe has a hole under each. */
  private syncBases(): void {
    const s = gameStore.getState();
    const all = [s.base, ...s.otherBases];
    for (const b of all) {
      if (this.settlements.has(b.id)) continue;
      const home = SITE_BY_ID[b.siteId]?.home ?? false;
      const m = new SettlementManager(this.terrain, this.events, { id: b.id, lat: b.lat, lon: b.lon, home });
      this.settlements.set(b.id, m);
      this.scene.add(m.group);
    }
    // Bases that no longer exist (a different save was loaded).
    for (const [id, m] of this.settlements) {
      if (all.some((b) => b.id === id)) continue;
      m.dispose();
      this.scene.remove(m.group);
      this.settlements.delete(id);
    }
    for (const [id, m] of this.settlements) m.setActive(id === s.base.id);
    for (const b of s.otherBases) this.settlements.get(b.id)?.showSnapshot(b.buildings, b.roads);
    const sites = all.map((b) => ({ lat: b.lat, lon: b.lon }));
    // Jezero first: its hole is the one baked into the crater patch.
    sites.sort((a, b) => Number(SITE_BY_ID.jezero.lat !== a.lat) - Number(SITE_BY_ID.jezero.lat !== b.lat));
    this.mars?.setHoles(sites);
    this.camera?.setBases(sites);
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  private handleClick(x: number, y: number): void {
    // Visiting: buildings can be looked at, nothing else.
    if (this.spectator.active) {
      if (this.camera.alt < 8) this.spectator.click(this.camera.getRay(x, y));
      return;
    }
    const s = gameStore.getState();
    // The pipeline tool builds when a drag is let go (LinkTools.pipelineEnd).
    if (s.pipelineMode) return;
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
      const ray = this.camera.getRay(x, y);
      const id = this.settlement.buildings.pick(ray);
      if (id) {
        s.selectBuilding(id);
        return;
      }
      // Any building of another base: switch to that base and open the clicked building.
      for (const b of s.otherBases) {
        const hit = this.settlements.get(b.id)?.buildings.pick(ray);
        const building = hit ? b.buildings.find((x) => x.id === hit) : undefined;
        if (!building) continue;
        s.switchBase(b.id);
        gameStore.getState().selectBuilding(building.id);
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
    if (this.spectator.active) return false;
    const s = gameStore.getState();
    if (s.pipelineMode) {
      s.stopPipelineMode();
      return true;
    }
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
    // The pause menu owns the keyboard while it is open.
    if (this.pauseMenu.isOpen) {
      if (key === 'escape') this.pauseMenu.close();
      return true;
    }
    if (this.spectator.active) {
      if (key === 'escape') Visits.stop();
      else if (key === 'h') this.events.emit('camera:home');
      else if (key === 'g') this.events.emit('camera:globe');
      else return false;
      return true;
    }
    switch (key) {
      case 'escape':
        // Something else (the mission log) already used this Escape.
        if (e.defaultPrevented) return true;
        if (this.handleCancel()) return true;
        if (s.started && !document.querySelector('.auth-modal, .welcome')) this.pauseMenu.open();
        return true;
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
          if (!res.ok) s.pushAlert({ key: 'cant-afford', level: 'warning', title: t('Not enough regolith for roads'), message: res.reason });
        }
        return true;
      case 'p':
        if (s.pipelineMode) s.stopPipelineMode();
        else {
          const res = s.startPipelineMode();
          if (!res.ok) s.pushAlert({ key: 'pipe-error', level: 'warning', title: t('Can’t lay a pipeline yet'), message: res.reason });
        }
        return true;
      case 'h':
        this.events.emit('camera:home');
        return true;
      case 'g':
        this.events.emit('camera:globe');
        return true;
      case 'v':
        this.xray.toggle();
        return true;
      case 'k':
        this.guide.toggle();
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
    this.graphics.sample(dt);
    this.sim.frame(dt);

    this.input.update(dt);
    this.camera.update(dt);
    const cam = this.camera.camera;
    const alt = this.camera.alt;

    this.updateHover();
    this.fog.update(dt);
    this.fleet.update(dt, alt);
    this.logistics.update(alt, cam.position);
    this.mars.update(cam.position, alt, dt);
    // The radar view is for maps: zooming in to a base switches it off.
    if (this.xray.isOn && alt < 10) this.xray.toggle();
    // Under the radar view the surface sinks away: hide what sits on it.
    const surface = this.mars.xrayAmount < 0.05;
    // While visiting, your own colony steps aside for the visited one.
    const own = surface && !this.spectator.active;
    this.fleet.group.visible = own;
    this.logistics.group.visible = own;
    for (const m of this.settlements.values()) m.group.visible = own;
    this.spectator.update(dt, time, alt, cam.position, surface);
    for (const m of this.settlements.values()) m.update(dt, time, alt, cam.position);
    this.updateLight(alt);

    this.labels.update(cam, alt, this.width, this.height);
    this.popups.update(cam, alt, this.width, this.height, dt);
    this.garageArrow.update(cam, this.width, this.height);
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
    if (!nearBase) return;
    // Redraw the shadow map when the light turned with the camera; while it is still, only
    // as often as the graphics tier asks (for animated parts).
    const moved = this.lastLightDir.distanceToSquared(this.lightDir) > 1e-8;
    this.lastLightDir.copy(this.lightDir);
    if (this.graphics.shadowsDue(moved)) this.renderer.shadowMap.needsUpdate = true;
  }
}

const TRAIT_DEPOSIT: Partial<Record<TraitId, number>> = {
  buried_glacier: DEPOSIT_KIND.glacier,
  hematite: DEPOSIT_KIND.hematite,
  clays: DEPOSIT_KIND.clays,
  lava_tube: DEPOSIT_KIND.lavaTube,
  ground_ice: DEPOSIT_KIND.groundIce,
  deep_water: DEPOSIT_KIND.deepWater,
};

/** What the radar can show: the deposits of every site the orbiter has spotted. */
function depositsFor(s: ReturnType<typeof gameStore.getState>): { lat: number; lon: number; kind: number }[] {
  const out: { lat: number; lon: number; kind: number }[] = [];
  const mk3 = s.research.completed.includes('orbiter_mk3');
  for (const site of BASE_SITES) {
    if (!s.sitesSeen[site.id] || !s.discoveredRegions[site.regionId]) continue;
    for (const t of site.traits) {
      const kind = TRAIT_DEPOSIT[t];
      if (!kind || (t === 'deep_water' && !mk3)) continue;
      out.push({ lat: site.lat, lon: site.lon, kind });
    }
  }
  return out;
}

/** Yields so the loading screen can repaint (setTimeout also works in background tabs). */
function nextFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 30));
}

