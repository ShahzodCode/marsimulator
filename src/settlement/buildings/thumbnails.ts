import * as THREE from 'three';
import { BUILDING_TYPES, type BuildingType } from '../../data/buildings';
import { buildBuildingModel } from './models';

/**
 * Small "photos" of every building, rendered once at start-up from the same 3D models
 * used on the map, so the menus show what will actually be built.
 */

export type ThumbKey = BuildingType | 'road';

const SIZE = 128;
const thumbs = new Map<ThumbKey, string>();

export function buildingThumbnail(key: ThumbKey): string | undefined {
  return thumbs.get(key);
}

/** Renders all thumbnails with the main renderer (call before the first frame). */
export function renderBuildingThumbnails(renderer: THREE.WebGLRenderer): void {
  const prevSize = renderer.getSize(new THREE.Vector2());
  const prevRatio = renderer.getPixelRatio();
  const prevTarget = renderer.getRenderTarget();
  const prevShadowUpdate = renderer.shadowMap.needsUpdate;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3a2a22');
  scene.add(new THREE.HemisphereLight('#ffe2c4', '#2a140c', 1.1));
  const sun = new THREE.DirectionalLight('#fff1e0', 2.6);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  const groundMat = new THREE.MeshStandardMaterial({ color: '#9a5634', roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 500);
  const dir = new THREE.Vector3(0.8, 0.85, 1).normalize();

  renderer.setRenderTarget(null);
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);

  const shot = (key: ThumbKey, obj: THREE.Object3D) => {
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    ground.scale.setScalar(sphere.radius * 1.8);
    ground.position.set(sphere.center.x, Math.max(box.min.y, 0) + 0.001, sphere.center.z);
    const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.82;
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.near = dist / 100;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);
    thumbs.set(key, renderer.domElement.toDataURL('image/png'));
    scene.remove(obj);
  };

  try {
    for (const type of BUILDING_TYPES) {
      try {
        shot(type, buildBuildingModel(type).group);
      } catch (err) {
        console.warn(`Could not render thumbnail for ${type}`, err);
      }
    }
    shot('road', roadPiece());
  } finally {
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);
    renderer.setRenderTarget(prevTarget);
    // Our renders have no shadow casters but still consume the flag — keep the scene's first shadow pass.
    renderer.shadowMap.needsUpdate = prevShadowUpdate;
    ground.geometry.dispose();
    groundMat.dispose();
  }
}

/** A short straight road with a dashed centre line. */
function roadPiece(): THREE.Group {
  const g = new THREE.Group();
  const asphalt = new THREE.MeshStandardMaterial({ color: '#3f3a37', roughness: 0.9 });
  const paint = new THREE.MeshStandardMaterial({ color: '#e8d9b5', roughness: 0.7 });
  const road = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 1.3), asphalt);
  road.position.y = 0.04;
  g.add(road);
  for (const x of [-1.4, 0, 1.4]) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.1), paint);
    dash.position.set(x, 0.09, 0);
    g.add(dash);
  }
  g.rotation.y = -0.5;
  return g;
}
