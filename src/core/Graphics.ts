import type * as THREE from 'three';
import { LocalPrefs } from '../persistence/LocalPrefs';

/**
 * Graphics settings (saved in localStorage) and the controller that applies them.
 *
 * Quality picks a tier: how sharp the picture is (pixel ratio), and whether and how
 * often shadows are drawn. "Auto" starts from a tier that suits the device and moves
 * between tiers by itself. Adaptive resolution renders slightly fewer pixels while the
 * frame rate is low and gives them back once the game runs smoothly again.
 */
export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type Tier = Exclude<Quality, 'auto'>;
/** Frames per second the loop may draw; 0 means as many as the screen shows. */
export type FpsLimit = 0 | 30 | 60;

export interface GraphicsSettings {
  quality: Quality;
  adaptive: boolean;
  fpsLimit: FpsLimit;
  showFps: boolean;
}

const DEFAULTS: GraphicsSettings = { quality: 'auto', adaptive: true, fpsLimit: 0, showFps: false };

interface TierSpec {
  maxPixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  /** Redraw the shadow map every N frames while the light is still (animations); it always redraws when the light moves. */
  shadowEvery: number;
}

const TIERS: Record<Tier, TierSpec> = {
  low: { maxPixelRatio: 1, shadows: false, shadowSize: 1024, shadowEvery: 0 },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowSize: 1024, shadowEvery: 4 },
  high: { maxPixelRatio: 2, shadows: true, shadowSize: 2048, shadowEvery: 1 },
};
const TIER_ORDER: Tier[] = ['low', 'medium', 'high'];

/** Lowest share of the tier's pixel ratio adaptive resolution goes down to. */
const MIN_SCALE = 0.6;
const SCALE_STEP = 0.1;
/** Frame rate drawn while the pause menu covers the game. */
const MENU_FPS = 30;

export interface GraphicsStats {
  fps: number;
  tier: Tier;
  /** Adaptive resolution share, 0.6..1. */
  scale: number;
}

type Listener = () => void;

function load(): GraphicsSettings {
  const saved = LocalPrefs.get('graphics');
  return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

/** A device that probably struggles with the high tier (phones, small laptops). */
function modestDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return touch || (navigator.hardwareConcurrency ?? 8) <= 4 || (mem !== undefined && mem <= 4);
}

/** Settings and live numbers for the UI; the Game's GraphicsController does the work. */
export const Graphics = {
  settings: load(),
  /** The graphics chip the browser draws with (e.g. "NVIDIA GeForce RTX 4060"), if it says. */
  gpu: '',
  /** True when that chip is a built-in (integrated) one rather than a gaming card. */
  integratedGpu: false,
  stats: { fps: 0, tier: modestDevice() ? 'medium' : 'high', scale: 1 } as GraphicsStats,
  /** True while the pause menu is open: the loop then draws fewer frames. */
  menuOpen: false,
  listeners: new Set<Listener>(),
  statListeners: new Set<Listener>(),

  set(patch: Partial<GraphicsSettings>): void {
    this.settings = { ...this.settings, ...patch };
    LocalPrefs.set('graphics', this.settings);
    for (const l of this.listeners) l();
  },
  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  onStats(fn: Listener): () => void {
    this.statListeners.add(fn);
    return () => this.statListeners.delete(fn);
  },
};

/**
 * Applies the settings to the renderer and watches the frame rate. Call `sample` once a
 * frame; every second it compares the frame rate with the goal and steps resolution (and,
 * on Auto, the tier) down quickly when it's low and back up slowly when it's high.
 * A step up that makes things slow again doubles the wait before the next try.
 */
export class GraphicsController {
  private tier: Tier;
  private scale = 1;
  private appliedShadowSize = 0;
  private frames = 0;
  private elapsed = 0;
  private slow = 0;
  private fast = 0;
  /** Seconds to ignore (shader compiles after a change make the first frames slow). */
  private warmup = 3;
  private upWait = 5;
  private sinceUp = Infinity;
  private frameNo = 0;
  /** After a resolution step down: the frame rate before it, and seconds left until we judge it. */
  private stepDown: { fps: number; scale: number; wait: number } | null = null;
  /** Seconds during which resolution is left alone, because lowering it didn't help. */
  private resolutionIdle = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private sun: THREE.DirectionalLight,
  ) {
    this.tier = Graphics.stats.tier;
    readGpu(renderer);
    Graphics.onChange(() => this.reset());
    this.reset();
  }

  /** Minimum milliseconds between drawn frames (0 = every display refresh). */
  get frameInterval(): number {
    const limit = Graphics.menuOpen ? Math.min(MENU_FPS, Graphics.settings.fpsLimit || MENU_FPS) : Graphics.settings.fpsLimit;
    return limit ? 1000 / limit : 0;
  }

  private get spec(): TierSpec {
    return TIERS[this.tier];
  }

  /** Whether the shadow map should be redrawn this frame. */
  shadowsDue(lightMoved: boolean): boolean {
    const s = this.spec;
    if (!s.shadows) return false;
    return lightMoved || this.frameNo % s.shadowEvery === 0;
  }

  sample(dt: number): void {
    this.frameNo++;
    // A stall (tab switch, long task) says nothing about steady performance.
    if (dt >= 0.1) return;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 1) return;
    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    Graphics.stats.fps = Math.round(fps);
    if (this.warmup > 0) this.warmup--;
    else if (!Graphics.menuOpen) this.adapt(fps);
    for (const l of Graphics.statListeners) l();
  }

  private adapt(fps: number): void {
    const { quality, adaptive, fpsLimit } = Graphics.settings;
    const auto = quality === 'auto';
    if (!adaptive && !auto) return;
    const goal = fpsLimit || 60;
    this.sinceUp++;
    if (this.resolutionIdle > 0) this.resolutionIdle--;
    // Did the last resolution step down help? If the frame rate barely moved, the
    // graphics card isn't what's holding the game back: put the pixels back.
    if (this.stepDown && --this.stepDown.wait <= 0) {
      const before = this.stepDown;
      this.stepDown = null;
      if (fps < before.fps * 1.06) {
        this.resolutionIdle = 60;
        this.setScale(before.scale);
        return;
      }
    }
    const canScale = adaptive && this.resolutionIdle === 0;
    if (fps < goal * 0.85) {
      this.fast = 0;
      if (++this.slow < 2) return;
      this.slow = 0;
      // Our last step up caused this: wait longer before trying again.
      if (this.sinceUp <= 3) this.upWait = Math.min(60, this.upWait * 2);
      if (canScale && this.scale > MIN_SCALE + 1e-3) {
        this.stepDown = { fps, scale: this.scale, wait: 2 };
        this.setScale(this.scale - SCALE_STEP);
      } else if (auto && this.tier !== 'low') this.setTier(TIER_ORDER[TIER_ORDER.indexOf(this.tier) - 1], 1);
      return;
    }
    this.slow = 0;
    if (fps < goal * 0.95) {
      this.fast = 0;
      return;
    }
    if (++this.fast < this.upWait) return;
    this.fast = 0;
    if (canScale && this.scale < 1 - 1e-3) this.setScale(this.scale + SCALE_STEP);
    else if (auto && this.tier !== 'high') this.setTier(TIER_ORDER[TIER_ORDER.indexOf(this.tier) + 1], adaptive ? MIN_SCALE + SCALE_STEP * 2 : 1);
    else return;
    this.sinceUp = 0;
  }

  private setScale(s: number): void {
    this.scale = Math.round(Math.min(1, Math.max(MIN_SCALE, s)) * 10) / 10;
    this.apply();
  }

  private setTier(t: Tier, scale: number): void {
    this.tier = t;
    this.scale = scale;
    // Switching shadows on or off recompiles shaders: don't judge the next few seconds.
    this.warmup = 2;
    this.apply();
  }

  /** Settings changed: start over from the chosen tier at full resolution. */
  private reset(): void {
    const q = Graphics.settings.quality;
    if (q !== 'auto') this.tier = q;
    this.scale = 1;
    this.slow = this.fast = 0;
    this.upWait = 5;
    this.warmup = 3;
    this.stepDown = null;
    this.resolutionIdle = 0;
    this.apply();
  }

  private apply(): void {
    const s = this.spec;
    const adaptiveScale = Graphics.settings.adaptive || Graphics.settings.quality === 'auto' ? this.scale : 1;
    const ratio = Math.max(0.5, Math.min(window.devicePixelRatio || 1, s.maxPixelRatio) * adaptiveScale);
    if (Math.abs(this.renderer.getPixelRatio() - ratio) > 1e-3) this.renderer.setPixelRatio(ratio);
    this.sun.castShadow = s.shadows;
    if (s.shadows && this.appliedShadowSize !== s.shadowSize) {
      this.appliedShadowSize = s.shadowSize;
      this.sun.shadow.mapSize.set(s.shadowSize, s.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
    // Low tier also drops the costly blurred-glass panels.
    document.documentElement.classList.toggle('perf-lite', this.tier === 'low');
    Graphics.stats.tier = this.tier;
    Graphics.stats.scale = adaptiveScale;
    for (const l of Graphics.statListeners) l();
  }
}

/** Reads the GPU name (Chrome, Edge and Firefox expose it) and guesses whether it's integrated. */
function readGpu(renderer: THREE.WebGLRenderer): void {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    // "ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11)" → "Intel(R) UHD Graphics"
    const m = raw.match(/^ANGLE \([^,]+, (.+?)(?: \(0x[0-9a-f]+\))?(?: Direct3D| OpenGL| Vulkan|,)/i);
    Graphics.gpu = (m ? m[1] : raw).trim();
    const dedicated = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a|arc b/i.test(raw);
    Graphics.integratedGpu = !dedicated && /intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega \d|swiftshader|basic render|llvmpipe/i.test(raw);
  } catch {
    /* unknown GPU */
  }
}
