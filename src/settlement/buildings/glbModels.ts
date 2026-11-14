import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BUILDING_TYPES, type BuildingType } from '../../data/buildings';

/**
 * Detailed building models made in Blender (sources in /blender, exported to
 * /public/models/<type>.glb). They are loaded once at start-up; every building instance
 * is a clone that shares geometry and materials with the cached original.
 *
 * Nodes carrying a `spin` custom property (rad/s) rotate around their local up axis
 * (fans, the excavator's bucket wheel, the ice drill string).
 */

const cache = new Map<BuildingType, THREE.Group>();

/** Buildings that only have a procedural model (no .glb exported yet). */
const PROCEDURAL_ONLY = new Set<BuildingType>(['storage_depot']);

/** Emissive strengths from Blender are tuned for Eevee; keep them sane under ACES. */
const MAX_EMISSIVE = 2.6;

export async function loadBuildingModels(renderer: THREE.WebGLRenderer, onProgress?: (f: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  // A soft studio environment so painted metal and glass get believable reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  let done = 0;
  const types = BUILDING_TYPES.filter((t) => !PROCEDURAL_ONLY.has(t));
  await Promise.all(
    types.map(async (type) => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${type}.glb`);
        cache.set(type, prepare(gltf.scene, env));
      } catch (err) {
        console.warn(`Building model ${type}.glb could not be loaded — using the simple model.`, err);
      } finally {
        onProgress?.(++done / types.length);
      }
    }),
  );
}

const seenMaterials = new Set<THREE.Material>();

function prepare(root: THREE.Group, env: THREE.Texture): THREE.Group {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.userData.sharedGeometry = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let castShadow = true;
    for (const m of mats as THREE.MeshStandardMaterial[]) {
      if (!seenMaterials.has(m)) {
        seenMaterials.add(m);
        m.envMap = env;
        m.envMapIntensity = 0.55;
        if (m.emissiveIntensity > MAX_EMISSIVE) m.emissiveIntensity = MAX_EMISSIVE;
        if (m.transparent) {
          m.depthWrite = false;
          m.side = THREE.DoubleSide;
          m.envMapIntensity = 1.2;
        }
      }
      if (m.transparent || (m.emissiveIntensity > 0 && m.color.getHex() === 0)) castShadow = false;
    }
    mesh.castShadow = castShadow;
    mesh.receiveShadow = !mats.some((m) => m.transparent);
    if (mats.some((m) => m.transparent)) mesh.renderOrder = 2;
  });
  return root;
}

export function hasBuildingModel(type: BuildingType): boolean {
  return cache.has(type);
}

export interface GlbInstance {
  group: THREE.Group;
  spinners: { node: THREE.Object3D; speed: number }[];
}

/** A new instance of the cached model (geometry shared), optionally with one override material. */
export function instantiateBuildingModel(type: BuildingType, override: THREE.Material | null): GlbInstance | null {
  const src = cache.get(type);
  if (!src) return null;
  const group = src.clone(true);
  const spinners: GlbInstance['spinners'] = [];
  group.traverse((o) => {
    const spin = o.userData?.spin;
    if (typeof spin === 'number' && spin !== 0) spinners.push({ node: o, speed: spin });
    const mesh = o as THREE.Mesh;
    if (override && mesh.isMesh) {
      mesh.material = override;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  });
  return { group, spinners };
}
