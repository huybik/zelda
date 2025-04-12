/* File: /src/systems/physics.ts */
import { Object3D, Vector3, Box3 } from "three";
import { Character } from "../entities/character";
import { Animal } from "../entities/animals"; // Import Animal

export class Physics {
  player: Character;
  collidableObjects: Object3D[];
  collisionCheckRadiusSq: number = 20 * 20;

  private overlap = new Vector3();
  private centerPlayer = new Vector3();
  private centerObject = new Vector3();
  private sizePlayer = new Vector3();
  private sizeObject = new Vector3();
  private pushVector = new Vector3();
  private objectBoundingBox = new Box3();

  constructor(player: Character, collidableObjects: Object3D[]) {
    this.player = player;
    this.collidableObjects = collidableObjects;
  }

  update(deltaTime: number): void {
    if (this.player.isDead || !this.player.mesh) return;
    const playerBox = this.player.boundingBox;
    if (!playerBox || playerBox.isEmpty()) this.player.updateBoundingBox();
    const playerPos = this.player.mesh!.position;

    this.collidableObjects.forEach((object) => {
      if (
        !object ||
        object === this.player.mesh ||
        !object.userData?.isCollidable || // Check if object itself is collidable
        object.userData?.isTerrain ||
        !object.parent
      )
        return;

      // Check if the entity reference is dead (Character or Animal)
      const entityRef = object.userData?.entityReference;
      if (
        entityRef &&
        ((entityRef instanceof Character && entityRef.isDead) ||
          (entityRef instanceof Animal && entityRef.isDead))
      ) {
        return; // Skip dead entities
      }

      // Check if the object itself (e.g., a depleted resource) is marked non-collidable
      if (object.userData?.isCollidable === false) {
        return;
      }

      const objectPosition = object.getWorldPosition(new Vector3());
      if (
        playerPos.distanceToSquared(objectPosition) >
        this.collisionCheckRadiusSq
      )
        return;

      let objectBox = object.userData.boundingBox as Box3 | undefined;
      if (!objectBox || objectBox.isEmpty()) {
        // Fallback: compute bounding box if missing or empty
        this.objectBoundingBox.setFromObject(object, true); // Use precise calculation
        objectBox = this.objectBoundingBox;
        if (objectBox.isEmpty()) return; // Skip if still empty after computation
        // Cache the computed box? Maybe not necessary if it's only a fallback.
      }

      if (playerBox.intersectsBox(objectBox)) {
        this.resolveCollision(playerBox, objectBox, object);
        this.player.updateBoundingBox(); // Update player box after potential position change
      }
    });
  }

  resolveCollision(playerBox: Box3, objectBox: Box3, object: Object3D): void {
    playerBox.getCenter(this.centerPlayer);
    objectBox.getCenter(this.centerObject);
    playerBox.getSize(this.sizePlayer);
    objectBox.getSize(this.sizeObject);

    // Calculate overlap on each axis
    this.overlap.x =
      this.sizePlayer.x / 2 +
      this.sizeObject.x / 2 -
      Math.abs(this.centerPlayer.x - this.centerObject.x);
    this.overlap.z =
      this.sizePlayer.z / 2 +
      this.sizeObject.z / 2 -
      Math.abs(this.centerPlayer.z - this.centerObject.z);

    // Find the axis of minimum overlap (MTV - Minimum Translation Vector)
    let minOverlap = Infinity;
    let pushAxis = -1; // 0 for X, 2 for Z

    if (this.overlap.x > 0.0001 && this.overlap.x < minOverlap) {
      minOverlap = this.overlap.x;
      pushAxis = 0;
    }
    if (this.overlap.z > 0.0001 && this.overlap.z < minOverlap) {
      minOverlap = this.overlap.z;
      pushAxis = 2;
    }

    // If no significant overlap, return
    if (pushAxis === -1 || minOverlap < 0.0001) return;

    this.pushVector.set(0, 0, 0);
    const pushMagnitude = minOverlap + 0.001; // Add a small epsilon to ensure separation

    // Determine push direction based on relative centers
    switch (pushAxis) {
      case 0: // Push along X-axis
        this.pushVector.x =
          this.centerPlayer.x > this.centerObject.x
            ? pushMagnitude
            : -pushMagnitude;
        // Optional: Stop velocity component against the push direction
        if (Math.sign(this.player.velocity.x) === Math.sign(this.pushVector.x))
          this.player.velocity.x = 0;
        break;
      case 2: // Push along Z-axis
        this.pushVector.z =
          this.centerPlayer.z > this.centerObject.z
            ? pushMagnitude
            : -pushMagnitude;
        // Optional: Stop velocity component against the push direction
        if (Math.sign(this.player.velocity.z) === Math.sign(this.pushVector.z))
          this.player.velocity.z = 0;
        break;
    }

    // Apply the push vector to the player's position
    this.player.mesh!.position.add(this.pushVector);
  }
}
