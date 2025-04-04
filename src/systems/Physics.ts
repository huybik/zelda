// src/systems/Physics.ts
import { Object3D, Box3, Vector3, Group, Object3DEventMap } from "three";
import { Character } from "../core/Character";
import { PHYSICS_COLLISION_CHECK_RADIUS_SQ } from "../config";

export class Physics {
  player: Character; // The character currently controlled by the player
  collidableObjects: Object3D[]; // List of all objects that can be collided with

  // Optimization: Only check collisions with objects within this squared radius
  private collisionCheckRadiusSq: number = PHYSICS_COLLISION_CHECK_RADIUS_SQ;

  // Reusable objects to avoid allocations in the update loop
  private playerBox = new Box3(); // Player's bounding box for the current frame
  private objectBox = new Box3(); // Bounding box of the object being checked
  private overlap = new Vector3(); // Stores overlap amount on each axis
  private centerPlayer = new Vector3(); // Player's center position
  private centerObject = new Vector3(); // Object's center position
  private sizePlayer = new Vector3(); // Player's size
  private sizeObject = new Vector3(); // Object's size
  private pushVector = new Vector3(); // Accumulated push vector from collisions this frame
  private intendedPosition = new Vector3(); // Player's position after applying velocity but before collision resolution

  constructor(player: Character, collidableObjects: Object3D[]) {
    this.player = player;
    this.collidableObjects = collidableObjects;
  }

  // Update the player reference (e.g., when control switches)
  setActivePlayer(newPlayer: Character): void {
    this.player = newPlayer;
  }

  // Main physics update loop, called each frame by the Game.
  update(deltaTime: number): void {
    if (this.player.isDead || !this.player.mesh) return;

    // 1. Calculate Intended Position
    this.intendedPosition.copy(this.player.mesh.position);
    this.intendedPosition.addScaledVector(this.player.velocity, deltaTime);

    // 2. Update Player Bounding Box for Collision Check
    this.player.updateBoundingBox();
    this.playerBox.copy(this.player.boundingBox);
    const translation = this.intendedPosition
      .clone()
      .sub(this.player.mesh.position);
    this.playerBox.translate(translation);

    // Reset the push vector for this frame
    this.pushVector.set(0, 0, 0);

    // 3. Collision Detection and Resolution Loop
    const playerWorldPos = this.intendedPosition;

    this.collidableObjects.forEach((object) => {
      if (
        !object?.parent ||
        object === this.player.mesh ||
        !object.userData?.isCollidable
      ) {
        return;
      }
      const entityRef = object.userData?.entityReference;
      if (entityRef instanceof Character && entityRef.isDead) {
        return;
      }

      const objectPosition = object.getWorldPosition(this.centerObject);
      if (
        playerWorldPos.distanceToSquared(objectPosition) >
        this.collisionCheckRadiusSq
      ) {
        return;
      }

      let currentObjectBox = object.userData.boundingBox as Box3 | undefined;
      if (!currentObjectBox || currentObjectBox.isEmpty()) {
        this.objectBox.setFromObject(object, true);
        currentObjectBox = this.objectBox;
        if (currentObjectBox.isEmpty()) return;
      }

      if (this.playerBox.intersectsBox(currentObjectBox)) {
        this.resolveCollision(this.playerBox, currentObjectBox);
        this.playerBox.translate(this.pushVector);
      }
    });

    // 4. Apply Final Position
    this.intendedPosition.add(this.pushVector);
    this.player.mesh.position.copy(this.intendedPosition);

    // 5. Snap to Terrain Height
    this.player.mesh!.position.y = this.player.getTerrainHeightAtPosition();

    // 6. Final Bounding Box Update
    this.player.updateBoundingBox();
  }

  // Resolves a single AABB collision by calculating the Minimum Translation Vector (MTV).
  private resolveCollision(playerBox: Box3, objectBox: Box3): void {
    // Get centers and sizes of the colliding boxes
    playerBox.getCenter(this.centerPlayer);
    objectBox.getCenter(this.centerObject);
    playerBox.getSize(this.sizePlayer);
    objectBox.getSize(this.sizeObject);

    // Calculate overlap on each axis
    this.overlap.x =
      this.sizePlayer.x / 2 +
      this.sizeObject.x / 2 -
      Math.abs(this.centerPlayer.x - this.centerObject.x);
    this.overlap.y =
      this.sizePlayer.y / 2 +
      this.sizeObject.y / 2 -
      Math.abs(this.centerPlayer.y - this.centerObject.y);
    this.overlap.z =
      this.sizePlayer.z / 2 +
      this.sizeObject.z / 2 -
      Math.abs(this.centerPlayer.z - this.centerObject.z);

    // Find the axis with the minimum overlap (MTV axis)
    let minOverlap = Infinity;
    let pushAxis = -1; // 0: x, 1: y, 2: z

    // Check X overlap
    if (this.overlap.x > 0 && this.overlap.x < minOverlap) {
      minOverlap = this.overlap.x;
      pushAxis = 0;
    }
    // Check Y overlap
    if (this.overlap.y > 0 && this.overlap.y < minOverlap) {
      minOverlap = this.overlap.y;
      pushAxis = 1;
    }
    // Check Z overlap
    if (this.overlap.z > 0 && this.overlap.z < minOverlap) {
      minOverlap = this.overlap.z;
      pushAxis = 2;
    }

    // If no positive overlap found, or overlap is negligible, no collision to resolve
    if (pushAxis === -1 || minOverlap < 0.0001) return;

    // Calculate the push vector based on the minimum overlap axis
    const pushMagnitude = minOverlap + 0.001; // Add a small epsilon to ensure separation
    this.pushVector.set(0, 0, 0); // Reset push vector for this specific collision

    switch (pushAxis) {
      case 0: // X-axis collision
        this.pushVector.x =
          this.centerPlayer.x > this.centerObject.x
            ? pushMagnitude
            : -pushMagnitude;
        // Stop velocity component pushing into the object
        if (
          Math.sign(this.player.velocity.x) === Math.sign(this.pushVector.x)
        ) {
          this.player.velocity.x = 0;
        }
        break;
      case 1: // Y-axis collision
        this.pushVector.y =
          this.centerPlayer.y > this.centerObject.y
            ? pushMagnitude
            : -pushMagnitude;
        // Handle vertical collision response (landing, hitting ceiling)
        if (this.pushVector.y > 0 && this.player.velocity.y < 0) {
          // Pushed up (landed on something)
          this.player.velocity.y = 0;
          // Ground check will handle isOnGround flags later
        } else if (this.pushVector.y < 0 && this.player.velocity.y > 0) {
          // Pushed down (hit ceiling)
          this.player.velocity.y = 0;
        }
        break;
      case 2: // Z-axis collision
        this.pushVector.z =
          this.centerPlayer.z > this.centerObject.z
            ? pushMagnitude
            : -pushMagnitude;
        // Stop velocity component pushing into the object
        if (
          Math.sign(this.player.velocity.z) === Math.sign(this.pushVector.z)
        ) {
          this.player.velocity.z = 0;
        }
        break;
    }

    // The calculated pushVector is applied to the intendedPosition in the main update loop
    // and also used to update the playerBox for subsequent checks in the same frame.
  }
}
