// File: src/objects/walls.ts
import {
  Scene,
  Object3D,
  MeshBasicMaterial,
  BoxGeometry,
  Mesh,
  DoubleSide,
  Box3,
} from "three";

export function createWorldBoundary(
  scene: Scene,
  worldSize: number,
  collidableObjects: Object3D[]
): void {
  const thickness = 20;
  const height = 100;
  const halfSize = worldSize / 2;
  const boundaryMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.0,
    side: DoubleSide,
    visible: false,
  });
  const createWall = (
    px: number,
    pz: number,
    sx: number,
    sz: number,
    name: string
  ) => {
    const wallGeo = new BoxGeometry(sx, height, sz);
    const wallMesh = new Mesh(wallGeo, boundaryMaterial);
    wallMesh.position.set(px, height / 2, pz);
    wallMesh.name = name;
    wallMesh.userData.isCollidable = true;
    wallMesh.geometry.computeBoundingBox();
    wallMesh.updateMatrixWorld(true);
    wallMesh.userData.boundingBox = wallMesh.geometry
      .boundingBox!.clone()
      .applyMatrix4(wallMesh.matrixWorld);
    scene.add(wallMesh);
    collidableObjects.push(wallMesh);
  };
  createWall(
    halfSize + thickness / 2,
    0,
    thickness,
    worldSize + thickness * 2,
    "Boundary+X"
  );
  createWall(
    -halfSize - thickness / 2,
    0,
    thickness,
    worldSize + thickness * 2,
    "Boundary-X"
  );
  createWall(
    0,
    halfSize + thickness / 2,
    worldSize + thickness * 2,
    thickness,
    "Boundary+Z"
  );
  createWall(
    0,
    -halfSize - thickness / 2,
    worldSize + thickness * 2,
    thickness,
    "Boundary-Z"
  );
}
