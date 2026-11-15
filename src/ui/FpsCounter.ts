import { Graphics } from '../core/Graphics';
import { h, setText, toggleClass } from './dom';

/** Small frames-per-second readout, shown when "Show FPS counter" is on in Settings. */
export class FpsCounter {
  constructor(parent: HTMLElement) {
    const el = h('div', { class: 'fps-counter hidden', attrs: { 'aria-hidden': 'true' } });
    parent.append(el);
    const render = () => {
      const on = Graphics.settings.showFps;
      toggleClass(el, 'hidden', !on);
      if (!on) return;
      const s = Graphics.stats;
      setText(el, `${s.fps} FPS · ${Math.round(s.scale * 100)}%`);
      toggleClass(el, 'slow', s.fps > 0 && s.fps < (Graphics.settings.fpsLimit || 60) * 0.85);
    };
    Graphics.onChange(render);
    Graphics.onStats(render);
    render();
  }
}
