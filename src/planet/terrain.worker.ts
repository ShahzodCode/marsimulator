/// <reference lib="webworker" />
import { generateGlobal, generatePatch } from './terrainGen';

export interface TerrainRequest {
  width: number;
  height: number;
  patchSize: number;
}

export type TerrainResponse =
  | { type: 'progress'; fraction: number; label: string }
  | {
      type: 'done';
      width: number;
      height: number;
      heights: Float32Array;
      color: Uint8Array;
      normal: Uint8Array;
      patchSize: number;
      patchColor: Uint8Array;
      patchNormal: Uint8Array;
      ms: number;
    };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<TerrainRequest>) => {
  const t0 = performance.now();
  const { width, height, patchSize } = e.data;
  let last = 0;
  let phase = '';
  let phaseStart = t0;
  const timings: string[] = [];
  const progress = (fraction: number, label: string) => {
    const now = performance.now();
    if (label !== phase) {
      if (phase) timings.push(`${phase}: ${(now - phaseStart).toFixed(0)}ms`);
      phase = label;
      phaseStart = now;
    }
    if (now - last < 50 && fraction < 1) return;
    last = now;
    ctx.postMessage({ type: 'progress', fraction, label } satisfies TerrainResponse);
  };
  const g = generateGlobal(width, height, progress);
  const p = generatePatch(g, patchSize, progress);
  console.info('[terrain worker]', timings.join(' | '));
  const msg: TerrainResponse = {
    type: 'done',
    width,
    height,
    heights: g.heights,
    color: g.color,
    normal: g.normal,
    patchSize: p.size,
    patchColor: p.color,
    patchNormal: p.normal,
    ms: performance.now() - t0,
  };
  ctx.postMessage(msg, [g.heights.buffer, g.color.buffer, g.normal.buffer, p.color.buffer, p.normal.buffer]);
};
