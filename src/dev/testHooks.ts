import type { Game } from '../core/Game';
import { gameStore } from '../state/gameStore';

/**
 * Development-only helpers for automated / manual testing from the browser console.
 * Loaded only when `import.meta.env.DEV` is true, never in production builds.
 *
 *   __step(n, dt)       advance n frames synchronously (works in background tabs)
 *   __snap()            render one frame and show it as an <img> (for screenshots of hidden tabs)
 *   __move(x, y)        hover the pointer over settlement grid coords
 *   __click(x, y)       click at settlement grid coords
 */
export function installTestHooks(game: Game): void {
  // Private members are reached through an untyped view on purpose: this is test tooling.
  const g = game as unknown as {
    frame(dt: number, t: number): void;
    renderer: { domElement: HTMLCanvasElement };
    canvas: HTMLCanvasElement;
    camera: { camera: import('three').PerspectiveCamera };
    settlement: { grid: { surfacePoint(x: number, y: number): import('three').Vector3 } };
  };
  let t = 1000;
  const step = (n: number, dt = 1 / 30) => {
    for (let i = 0; i < n; i++) {
      t += dt;
      g.frame(dt, t);
    }
  };
  const toScreen = (gx: number, gy: number) => {
    const p = g.settlement.grid.surfacePoint(gx, gy).project(g.camera.camera);
    const r = g.canvas.getBoundingClientRect();
    return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height };
  };
  const pointer = (type: string, gx: number, gy: number) => {
    const s = toScreen(gx, gy);
    g.canvas.dispatchEvent(new PointerEvent(type, { clientX: s.x, clientY: s.y, pointerId: 1, bubbles: true, button: 0 }));
    return s;
  };
  Object.assign(window, {
    __game: game,
    __store: gameStore,
    __step: step,
    __snap: () => {
      step(1);
      const url = g.renderer.domElement.toDataURL('image/jpeg', 0.85);
      let img = document.getElementById('__snap') as HTMLImageElement | null;
      if (!img) {
        img = document.createElement('img');
        img.id = '__snap';
        img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none';
        document.getElementById('app')!.insertBefore(img, document.getElementById('ui-root'));
      }
      img.src = url;
    },
    __move: (gx: number, gy: number) => {
      const s = pointer('pointermove', gx, gy);
      step(2);
      return s;
    },
    __click: (gx: number, gy: number) => {
      pointer('pointermove', gx, gy);
      pointer('pointerdown', gx, gy);
      const s = pointer('pointerup', gx, gy);
      step(2);
      return s;
    },
  });
}
