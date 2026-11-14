import * as THREE from 'three';

/**
 * Shared, cached materials for all procedural models. Materials are reused by every
 * building instance, so they are never disposed per-building (only on full teardown).
 */

function std(color: string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function glow(color: string, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: intensity, roughness: 1 });
}

function solarTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9d2dc';
  g.fillRect(0, 0, 128, 128);
  const n = 6;
  const m = 3;
  const s = (128 - m * (n + 1)) / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = m + x * (s + m);
      const py = m + y * (s + m);
      const grad = g.createLinearGradient(px, py, px + s, py + s);
      grad.addColorStop(0, '#1f3f8f');
      grad.addColorStop(1, '#13275e');
      g.fillStyle = grad;
      g.fillRect(px, py, s, s);
      g.fillStyle = 'rgba(160,190,255,0.25)';
      g.fillRect(px, py + s / 2, s, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let cache: ReturnType<typeof create> | null = null;

function create() {
  return {
    white: std('#ece8e1', 0.5),
    panel: std('#cfcac2', 0.65),
    orange: std('#e8692c', 0.5),
    teal: std('#2bb3a3', 0.5),
    yellow: std('#f2b630', 0.55),
    darkMetal: std('#3a3f48', 0.45, 0.55),
    metal: std('#a6aeb8', 0.35, 0.75),
    concrete: std('#8e8379', 0.95),
    pad: std('#a39587', 1),
    asphalt: std('#5d524c', 1),
    glass: new THREE.MeshStandardMaterial({
      color: '#bfe6ff',
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    solar: std('#ffffff', 0.32, 0.35, { map: solarTexture() }),
    plant: std('#58b947', 0.85),
    plantDark: std('#2f7d32', 0.85),
    tomato: std('#e53935', 0.5),
    wheat: std('#e8c547', 0.8),
    soil: std('#5b3b2a', 1),
    straw: std('#e3c46a', 1),
    wood: std('#8d5a3b', 0.9),
    roofRed: std('#b5392a', 0.7),
    waterTank: std('#3c8fd8', 0.4, 0.2),
    oxygenTank: std('#f1f6f5', 0.35, 0.2),
    ice: std('#bfe7ff', 0.2, 0.05, { emissive: '#163a52', emissiveIntensity: 0.4 }),
    ore: std('#a8552c', 1),
    oreDark: std('#7a3a1e', 1),
    rock: std('#86513a', 0.95),
    ingot: std('#c3ccd6', 0.3, 0.9),
    rubber: std('#22252b', 0.9),
    glowWhite: glow('#fff2d6', 2.2),
    glowCyan: glow('#5ff3ff', 2.0),
    glowOrange: glow('#ff8a2a', 2.6),
    glowPink: glow('#ff5fd2', 1.6),
    glowRed: glow('#ff3b3b', 2.4),
    glowGreen: glow('#6dff8a', 2.0),
    chicken: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  };
}

export type MaterialLibrary = ReturnType<typeof create>;

export function materials(): MaterialLibrary {
  if (!cache) cache = create();
  return cache;
}

export function createGhostMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#58ff9a',
    emissive: '#1d7a45',
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    roughness: 0.6,
  });
}
