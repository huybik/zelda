import {
  Vector3,
  Quaternion,
  Mesh,
  Scene,
  Raycaster,
} from "three";

// Moved from utils.ts
export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function smoothVectorLerp(
  current: Vector3,
  target: Vector3,
  alphaBase: number,
  deltaTime: number
): Vector3 {
  if (alphaBase <= 0) return current.copy(target);
  if (alphaBase >= 1) return current;
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.lerp(target, factor);
}

export function smoothQuaternionSlerp(
  current: Quaternion,
  target: Quaternion,
  alphaBase: number,
  deltaTime: number
): Quaternion {
  if (alphaBase <= 0) return current.copy(target);
  if (alphaBase >= 1) return current;
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.slerp(target, factor);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

export function getTerrainHeight(scene: Scene, x: number, z: number): number {
  const terrain = scene.getObjectByName("Terrain") as Mesh;
  if (!terrain) return 0;
  const raycaster = new Raycaster(
    new Vector3(x, 200, z),
    new Vector3(0, -1, 0)
  );
  const intersects = raycaster.intersectObject(terrain);
  return intersects.length > 0 ? intersects[0].point.y : 0;
} 