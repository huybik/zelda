import * as THREE from 'three';
import { Player } from '../entities/player';
import { Entity } from '../entities/entity'; // Import base entity if checking specific types

// Reusable vectors and box
const _overlap = new THREE.Vector3();
const _centerPlayer = new THREE.Vector3();
const _centerObject = new THREE.Vector3();
const _sizePlayer = new THREE.Vector3();
const _sizeObject = new THREE.Vector3();
const _pushVector = new THREE.Vector3();
const _tempBox = new THREE.Box3(); // For objects without precomputed box
const _objectPos = new THREE.Vector3(); // For distance check


export class Physics {
    private player: Player;
    // List can contain diverse THREE objects, ensure they have expected userData
    private collidableObjects: THREE.Object3D[];

    // Optimization: Broad phase check radius (squared)
    private collisionCheckRadiusSq: number = 20 * 20; // Check within 20 units

    constructor(player: Player, collidableObjects: THREE.Object3D[]) {
        this.player = player;
        // Ensure it's a reference to the game's main array
        this.collidableObjects = collidableObjects;
    }

    update(deltaTime: number): void {
        // Player handles its own gravity/ground check via raycasting.
        // This system handles collision *response* (push-out).
        this.handleCollisions(deltaTime);
    }

    private handleCollisions(deltaTime: number): void {
        if (this.player.isDead) return;

        // Ensure player bounding box is up-to-date (should be called in Player.update)
        const playerBox = this.player.userData.boundingBox;
        if (!playerBox || playerBox.isEmpty()) {
            // console.warn("Player bounding box missing or empty in physics update");
            this.player.updateBoundingBox(); // Attempt recovery
             if (!this.player.userData.boundingBox || this.player.userData.boundingBox.isEmpty()) {
                 console.error("Cannot perform physics update without player bounding box.");
                 return; // Skip if still invalid
             }
        }

        const playerPos = this.player.mesh.position;

        this.collidableObjects.forEach(object => {
            // --- Basic Filters ---
            if (!object || object === this.player.mesh || !object.userData?.isCollidable || object.userData?.isTerrain || !object.parent) {
                return; // Skip self, non-collidables, terrain, or removed objects
            }
            // Skip dead entities if they are in this list (should ideally be removed)
            if (object.userData?.entityReference?.isDead) {
                return;
            }

            // --- Broad Phase: Distance Check ---
            object.getWorldPosition(_objectPos);
            if (playerPos.distanceToSquared(_objectPos) > this.collisionCheckRadiusSq) {
                return; // Too far away
            }

            // --- Get Object's Bounding Box ---
            let objectBox = object.userData.boundingBox as THREE.Box3 | undefined;

            // If missing or empty, try to compute it dynamically
            // Note: Dynamic computation can be slow if done every frame for many objects.
            // It's better if objects update their own boxes when they move.
            if (!objectBox || objectBox.isEmpty()) {
                // console.warn(`Bounding box missing for ${object.name}. Computing dynamically.`);
                if (object instanceof THREE.Mesh && object.geometry?.boundingBox) {
                     // If geometry has a box, transform it to world space
                     if (object instanceof THREE.Mesh && object.geometry?.boundingBox) {
                         _tempBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
                     } else {
                         return; // Skip if not a mesh or geometry is missing
                     }
                } else {
                     // Fallback: compute from object hierarchy (potentially slow)
                     _tempBox.setFromObject(object, true); // Recursive check
                }
                objectBox = _tempBox; // Use the computed temporary box
                 if (objectBox.isEmpty()) {
                    // console.warn(`Could not compute valid bounding box for ${object.name}. Skipping collision.`);
                    return; // Still empty, cannot collide
                 }
                 // Optionally cache the computed box (careful, it might become stale)
                 // object.userData.boundingBox = objectBox.clone();
            }


            // --- Narrow Phase: AABB Intersection Test ---
            if (playerBox && playerBox.intersectsBox(objectBox)) {
                this.resolveCollision(playerBox, objectBox, object);
                // IMPORTANT: Player box might have moved, subsequent checks need the updated position.
                // The player's OWN updateBoundingBox is called at the end of its update loop,
                // but after a push-out HERE, it needs immediate update for the *next* object check in *this* loop.
                 this.player.updateBoundingBox();
            }
        });
    }

    private resolveCollision(playerBox: THREE.Box3, objectBox: THREE.Box3, object: THREE.Object3D): void {
        // console.log(`Collision: Player intersects ${object.name || 'object'}`);

        // --- Calculate Overlap (Penetration Depth) ---
        playerBox.getCenter(_centerPlayer);
        objectBox.getCenter(_centerObject);
        playerBox.getSize(_sizePlayer);
        objectBox.getSize(_sizeObject);

        // Calculate overlap on each axis
        _overlap.x = (_sizePlayer.x / 2 + _sizeObject.x / 2) - Math.abs(_centerPlayer.x - _centerObject.x);
        _overlap.y = (_sizePlayer.y / 2 + _sizeObject.y / 2) - Math.abs(_centerPlayer.y - _centerObject.y);
        _overlap.z = (_sizePlayer.z / 2 + _sizeObject.z / 2) - Math.abs(_centerPlayer.z - _centerObject.z);

        // Determine minimum positive overlap (axis of least penetration)
        let minOverlap = Infinity;
        let pushAxis = -1; // 0:x, 1:y, 2:z

        if (_overlap.x > 0 && _overlap.x < minOverlap) { minOverlap = _overlap.x; pushAxis = 0; }
        if (_overlap.y > 0 && _overlap.y < minOverlap) { minOverlap = _overlap.y; pushAxis = 1; }
        if (_overlap.z > 0 && _overlap.z < minOverlap) { minOverlap = _overlap.z; pushAxis = 2; }

        // Ignore negligible overlaps or errors
        if (pushAxis === -1 || minOverlap < 0.0001) {
            // console.log("Negligible overlap, skipping push.");
            return;
        }

        // --- Determine Push Direction ---
        _pushVector.set(0, 0, 0);
        const pushMagnitude = minOverlap + 0.001; // Add tiny buffer to ensure separation

        switch (pushAxis) {
            case 0: // Push on X
                _pushVector.x = (_centerPlayer.x > _centerObject.x) ? pushMagnitude : -pushMagnitude;
                if (Math.sign(this.player.velocity.x) === Math.sign(_pushVector.x)) {
                    this.player.velocity.x = 0; // Stop velocity if moving into the wall
                }
                break;
            case 1: // Push on Y
                _pushVector.y = (_centerPlayer.y > _centerObject.y) ? pushMagnitude : -pushMagnitude;
                 // If pushed upwards significantly (landed on object)
                if (_pushVector.y > 0.01 && this.player.velocity.y <= 0) {
                    this.player.velocity.y = 0; // Stop falling
                    this.player.isOnGround = true; // Consider player grounded
                    this.player.canJump = true;
                    // console.log(`Collision push-up: Landed on ${object.name}`);
                }
                // If pushed downwards (hit head)
                else if (_pushVector.y < -0.01 && this.player.velocity.y > 0) {
                    this.player.velocity.y = 0; // Stop upward movement
                }
                break;
            case 2: // Push on Z
                _pushVector.z = (_centerPlayer.z > _centerObject.z) ? pushMagnitude : -pushMagnitude;
                 if (Math.sign(this.player.velocity.z) === Math.sign(_pushVector.z)) {
                    this.player.velocity.z = 0; // Stop velocity if moving into the wall
                 }
                break;
        }

        // --- Apply Push Correction ---
        this.player.mesh.position.add(_pushVector);

        // Consider relative velocity/mass for more complex physics later if needed.
    }
}