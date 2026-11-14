import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BUILDING_TYPES, type BuildingType } from '../../data/buildings';

/**
 * Detailed building models made in Blender (sources in /blender and
 * /assets/mars-assets-v2/source, exported to /public/models/<type>.glb). They are loaded once at start-up; every building instance
 * is a clone that shares geometry and materials with the cached original.
 *
 * Nodes carrying a `spin` custom property (rad/s) rotate around their local up axis
 * (fans, the excavator's bucket wheel, the ice drill string).
 */

const cache = new Map<BuildingType, THREE.Group>();

/** Emissive strengths from Blender are tuned for Eevee; keep them sane under ACES. */
const MAX_EMISSIVE = 2.6;

export async function loadBuildingModels(renderer: THREE.WebGLRenderer, onProgress?: (f: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  // A soft studio environment so painted metal and glass get believable reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  let done = 0;
  const types = BUILDING_TYPES;
  const total = types.length + VEHICLE_MODELS.length;
  await Promise.all([
    ...types.map(async (type) => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${type}.glb`);
        cache.set(type, prepare(gltf.scene, env));
      } catch (err) {
        console.warn(`Building model ${type}.glb could not be loaded — using the simple model.`, err);
      } finally {
        onProgress?.(++done / total);
      }
    }),
    ...VEHICLE_MODELS.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
        vehicles.set(name, normalizeLength(prepare(gltf.scene, env)));
      } catch (err) {
        console.warn(`Vehicle model ${name}.glb could not be loaded — using the simple model.`, err);
      } finally {
        onProgress?.(++done / total);
      }
    }),
  ]);
}

/** Vehicles made in Blender (blender/crew_rover.py), +X forward. */
export const VEHICLE_MODELS = ['crew_rover', 'cargo_rover'] as const;
export type VehicleModel = (typeof VEHICLE_MODELS)[number];

const vehicles = new Map<VehicleModel, THREE.Group>();

/** Wraps a model so it is one unit long along X, centred on X/Z, with its wheels on y = 0. */
function normalizeLength(root: THREE.Group): THREE.Group {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const s = 1 / Math.max(size.x, 1e-6);
  const centre = box.getCenter(new THREE.Vector3());
  root.scale.setScalar(s);
  root.position.set(-centre.x * s, -box.min.y * s, -centre.z * s);
  const wrap = new THREE.Group();
  wrap.add(root);
  return wrap;
}

/** A new instance of a vehicle model (geometry and materials shared), or null if it didn't load. */
export function instantiateVehicleModel(name: VehicleModel): THREE.Group | null {
  return vehicles.get(name)?.clone(true) ?? null;
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
