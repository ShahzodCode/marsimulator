import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

/** Buildings that only have the simple code-built model (no .glb to fetch). */
const CODE_ONLY_BUILDINGS: ReadonlySet<BuildingType> = new Set<BuildingType>(['cargo_garage']);

/** Emissive strengths from Blender are tuned for Eevee; keep them sane under ACES. */
const MAX_EMISSIVE = 2.6;

export async function loadBuildingModels(renderer: THREE.WebGLRenderer, onProgress?: (f: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  // A soft studio environment so painted metal and glass get believable reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  let done = 0;
  const types = BUILDING_TYPES.filter((t) => !CODE_ONLY_BUILDINGS.has(t));
  const total = types.length + VEHICLE_MODELS.length + SITE_MODELS.length + PIPE_MODELS.length;
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
    ...SITE_MODELS.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
        sites.set(name, normalizeLength(prepare(gltf.scene, env), false));
      } catch (err) {
        console.warn(`Site model ${name}.glb could not be loaded — using the simple model.`, err);
      } finally {
        onProgress?.(++done / total);
      }
    }),
    ...PIPE_MODELS.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
        const root = prepare(gltf.scene, env);
        root.updateMatrixWorld(true);
        const parts: PipePart[] = [];
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          parts.push({ geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), material: mesh.material as THREE.MeshStandardMaterial });
        });
        pipeParts.set(name, parts);
      } catch (err) {
        console.warn(`Pipeline model ${name}.glb could not be loaded — using the simple tube.`, err);
      } finally {
        onProgress?.(++done / total);
      }
    }),
  ]);
}

/**
 * Pipeline modules made in Blender (blender/pipeline.py): 1 unit = 1 cell, pipe along +X.
 * They are drawn as instanced meshes, so each comes as plain geometry + material pairs.
 */
export const PIPE_MODELS = ['pipe_span', 'pipe_support', 'pipe_expansion', 'pipe_buckled'] as const;
export type PipeModel = (typeof PIPE_MODELS)[number];
export interface PipePart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}
const pipeParts = new Map<PipeModel, PipePart[]>();

/** The parts of a pipeline module, or null if it didn't load. */
export function pipeModelParts(name: PipeModel): PipePart[] | null {
  return pipeParts.get(name) ?? null;
}

/** Vehicles made in Blender (blender/crew_rover.py), +X forward. */
export const VEHICLE_MODELS = ['crew_rover', 'cargo_rover'] as const;
export type VehicleModel = (typeof VEHICLE_MODELS)[number];

const vehicles = new Map<VehicleModel, THREE.Group>();

/**
 * Wraps a model so it is one unit long along X and centred on X/Z. Vehicles get their wheels
 * on y = 0; sites keep Blender's ground (z = 0) as y = 0, so their foundations stay buried.
 */
function normalizeLength(root: THREE.Group, liftToGround = true): THREE.Group {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const s = 1 / Math.max(size.x, 1e-6);
  const centre = box.getCenter(new THREE.Vector3());
  root.scale.setScalar(s);
  root.position.set(-centre.x * s, liftToGround ? -box.min.y * s : 0, -centre.z * s);
  const wrap = new THREE.Group();
  wrap.add(root);
  return wrap;
}

/** A new instance of a vehicle model (geometry and materials shared), or null if it didn't load. */
export function instantiateVehicleModel(name: VehicleModel): THREE.Group | null {
  return vehicles.get(name)?.clone(true) ?? null;
}

/** Map sites made in Blender (blender/ice_outpost.py): one unit across along X, ground at y = 0. */
export const SITE_MODELS = ['ice_outpost'] as const;
export type SiteModel = (typeof SITE_MODELS)[number];

const sites = new Map<SiteModel, THREE.Group>();

/** A new instance of a site model (geometry and materials shared), or null if it didn't load. */
export function instantiateSiteModel(name: SiteModel): THREE.Group | null {
  return sites.get(name)?.clone(true) ?? null;
}

const seenMaterials = new Set<THREE.Material>();

/**
 * Every .glb brings its own copy of the shared palette ("steel", "hull_white"…). Identical
 * materials are folded into one object, so the base-wide batch (BuildingManager) can draw
 * the steel of every building type in a single call.
 */
const materialPool = new Map<string, THREE.Material>();

function pooled(m: THREE.Material): THREE.Material {
  // Pipeline status lights are recoloured at run time (LogisticsView): keep them apart.
  if (m.name.startsWith('pipe_')) return m;
  const json = m.toJSON() as unknown as Record<string, unknown>;
  delete json.uuid;
  delete json.metadata;
  const key = JSON.stringify(json);
  const hit = materialPool.get(key);
  if (hit) {
    if (hit !== m) m.dispose();
    return hit;
  }
  materialPool.set(key, m);
  return m;
}

function prepare(root: THREE.Group, env: THREE.Texture): THREE.Group {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.userData.sharedGeometry = true;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(pooled) : pooled(mesh.material);
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
  mergeStatic(root);
  return root;
}

/**
 * Blender exports every part as its own mesh: ~20 per building, each one a draw call
 * (twice with shadows). Parts that never move are merged into one mesh per material,
 * so a building costs a handful of draw calls. Spinning nodes (and everything under
 * them) are left as they are.
 */
function mergeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(mesh.material) || mesh.morphTargetInfluences?.length) return;
    for (let n: THREE.Object3D | null = mesh; n; n = n === root ? null : n.parent) if (typeof n.userData?.spin === 'number' && n.userData.spin !== 0) return;
    const g = mesh.geometry;
    const attrs = Object.keys(g.attributes)
      .sort()
      .map((k) => `${k}:${g.attributes[k].itemSize}:${g.attributes[k].normalized}:${(g.attributes[k] as THREE.BufferAttribute).array?.constructor.name}`)
      .join(',');
    const key = `${mesh.material.uuid}|${attrs}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
    const list = groups.get(key);
    if (list) list.push(mesh);
    else groups.set(key, [mesh]);
  });
  const m = new THREE.Matrix4();
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      m.multiplyMatrices(toRoot, mesh.matrixWorld);
      const g = mesh.geometry.clone();
      for (const k of Object.keys(g.attributes)) {
        // Interleaved buffers can't be merged as they are.
        const a = g.attributes[k] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
        if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) g.setAttribute(k, (a as THREE.InterleavedBufferAttribute).clone());
      }
      if (!g.index) {
        const idx = new Uint32Array(g.attributes.position.count);
        for (let i = 0; i < idx.length; i++) idx[i] = i;
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      g.applyMatrix4(m);
      // A mirrored transform turns triangles inside out: flip their winding back.
      if (m.determinant() < 0) {
        const ix = g.index!;
        for (let i = 0; i < ix.count; i += 3) {
          const b = ix.getX(i + 1);
          ix.setX(i + 1, ix.getX(i + 2));
          ix.setX(i + 2, b);
        }
      }
      g.morphAttributes = {};
      return g;
    });
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const first = meshes[0];
    const out = new THREE.Mesh(merged, first.material);
    out.name = `${(first.material as THREE.Material).name || 'part'}-merged`;
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.renderOrder = first.renderOrder;
    out.userData.sharedGeometry = true;
    for (const mesh of meshes) mesh.removeFromParent();
    root.add(out);
  }
  // Drop the now-empty groups left behind.
  const prune = (o: THREE.Object3D): boolean => {
    for (const c of [...o.children]) if (prune(c)) c.removeFromParent();
    return o !== root && o.children.length === 0 && (o.type === 'Object3D' || o.type === 'Group') && !o.userData?.spin;
  };
  prune(root);
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
