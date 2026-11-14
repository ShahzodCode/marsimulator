import type { CameraController } from '../planet/CameraController';

export interface InputTarget {
  /** Primary click/tap without dragging. */
  onClick(clientX: number, clientY: number): void;
  /** Right click without dragging (cancel). */
  onSecondaryClick(): void;
  onKey(key: string, e: KeyboardEvent): boolean;
  /** When true, a left-button drag paints (e.g. lays roads) instead of panning. */
  paintMode?(): boolean;
  onPaint?(clientX: number, clientY: number, start: boolean): void;
}

interface PointerState {
  x: number;
  y: number;
  startX: number;
  startY: number;
  button: number;
  dragged: boolean;
  painting: boolean;
}

const DRAG_THRESHOLD = 6;

/**
 * Mouse, touch and keyboard input for the map: drag to pan, wheel / pinch to zoom,
 * right-drag to rotate (horizontal) and tilt (vertical), Q/E to rotate, click / tap to interact.
 */
export class InputController {
  private pointers = new Map<number, PointerState>();
  private keys = new Set<string>();
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  /** Last pointer position for hover picking (null when outside the canvas). */
  hover: { x: number; y: number; dirty: boolean } | null = null;

  constructor(
    private el: HTMLElement,
    private camera: CameraController,
    private target: InputTarget,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointerleave', () => {
      if (!this.pointers.size) this.hover = null;
    });
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private onDown = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    const painting = e.button === 0 && this.pointers.size === 0 && !!this.target.paintMode?.();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, button: e.button, dragged: false, painting });
    if (painting) this.target.onPaint?.(e.clientX, e.clientY, true);
    if (this.pointers.size === 2) {
      for (const q of this.pointers.values()) q.painting = false;
      this.startPinch();
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.hover = { x: e.clientX, y: e.clientY, dirty: true };
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.dragged && Math.hypot(p.x - p.startX, p.y - p.startY) > DRAG_THRESHOLD) p.dragged = true;
    if (this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }
    if (p.painting) {
      this.target.onPaint?.(e.clientX, e.clientY, false);
      return;
    }
    if (!p.dragged) return;
    if (p.button === 2 || (p.button === 0 && e.shiftKey)) {
      // Horizontal drag spins the view; vertical drag raises / lowers the camera.
      this.camera.rotate(dx * 0.006);
      this.camera.pitch(-dy * 0.005);
    } else this.camera.panPixels(dx, dy);
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (!p || p.dragged || this.pointers.size > 0) {
      // End of a gesture: mark remaining pointers as dragging so lifting one finger doesn't click.
      for (const q of this.pointers.values()) q.dragged = true;
      return;
    }
    if (p.button === 0) this.target.onClick(e.clientX, e.clientY);
    else if (p.button === 2) this.target.onSecondaryClick();
  };

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
  };

  private startPinch(): void {
    const [a, b] = [...this.pointers.values()];
    this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    a.dragged = b.dragged = true;
  }

  private updatePinch(): void {
    const [a, b] = [...this.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (this.pinchDist > 0 && dist > 0) this.camera.zoomAt(this.pinchDist / dist, mid.x, mid.y);
    this.camera.panPixels(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
    this.pinchDist = dist;
    this.pinchMid = mid;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dy = clamp(e.deltaY * scale, -300, 300);
    this.camera.zoomAt(Math.exp(dy * 0.0016), e.clientX, e.clientY);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (this.target.onKey(key, e)) {
      e.preventDefault();
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e'].includes(key)) {
      this.keys.add(key);
      if (key.startsWith('arrow')) e.preventDefault();
    } else if (key === '+' || key === '=') this.camera.zoomAt(0.7);
    else if (key === '-' || key === '_') this.camera.zoomAt(1.45);
  };

  /** Continuous keyboard panning / rotation. */
  update(dt: number): void {
    if (!this.keys.size) return;
    const speed = 520 * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy += speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy -= speed;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx += speed;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx -= speed;
    if (dx || dy) this.camera.panPixels(dx, dy);
    if (this.keys.has('q')) this.camera.rotate(-1.6 * dt);
    if (this.keys.has('e')) this.camera.rotate(1.6 * dt);
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
