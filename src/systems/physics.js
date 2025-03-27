import * as THREE from 'three';

// Reusable vectors and box
const _overlap = new THREE.Vector3();
const _centerPlayer = new THREE.Vector3();
const _centerObject = new THREE.Vector3();
const _sizePlayer = new THREE.Vector3();
const _sizeObject = new THREE.Vector3();
const _pushVector = new THREE.Vector3();
const _tempBox = new THREE.Box3(); // For objects without precomputed box

export class Physics {
    constructor(player, collidableObjects) {
        this.player = player;
        // Ensure collidableObjects is an array
        this.collidableObjects = Array.isArray(collidableObjects) ? collidableObjects : [];
    }

    update(deltaTime) {
        // Player handles its own gravity and ground check via raycasting.
        // This system focuses on collision *response* (push-out) after player movement.

        this.handleCollisions(deltaTime);

        // Optionally, update bounding boxes for dynamic objects here if they haven't updated themselves
        // this.updateDynamicObjectBounds();
    }

    handleCollisions(deltaTime) {
    if (!this.player || this.player.isDead) return;

    // Ensure player bounding box is up-to-date after player movement in Player.update
    // If Player.update calls updateBoundingBox(), this should be current.
    const playerBox = this.player.mesh?.userData?.boundingBox; // Use optional chaining
    if (!playerBox || playerBox.isEmpty()) {
         // console.warn("Player bounding box missing or empty in physics update");
         this.player.updateBoundingBox(); // Try to update it now
         if (!this.player.mesh?.userData?.boundingBox || this.player.mesh.userData.boundingBox.isEmpty()) return; // Still bad, skip
    }


    const playerPos = this.player.mesh.position;
    // Define a reasonable distance for collision checks (e.g., player size + object size buffer)
    const collisionCheckRadiusSq = 15 * 15; // Check within 15 units squared

    this.collidableObjects.forEach(object => {
        // Basic Checks: Skip self, non-collidables, or terrain (handled by player ground check)
        if (!object || object === this.player.mesh || !object.userData?.isCollidable || object.userData?.isTerrain) {
             return;
        }

        // Ensure the object is still valid (might have been removed from scene)
        if (!object.parent) {
            // TODO: Need a way to remove objects from collidableObjects list when they are destroyed
            return;
        }

        // ***** OPTIMIZATION: Broad phase distance check *****
        const objectPos = object.position;
        if (playerPos.distanceToSquared(objectPos) > collisionCheckRadiusSq) {
             return; // Object is too far away, skip detailed check
        }

        // Get object's bounding box (ensure it's up-to-date or calculate if missing)
        let objectBox = object.userData.boundingBox;
        if (!objectBox || objectBox.isEmpty()) {
            // Attempt to calculate/update the bounding box if missing
             if (object.geometry && object.geometry.boundingBox) {
                // Use geometry bounding box if available and apply world matrix
                objectBox = _tempBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
             } else if (object instanceof THREE.Object3D) {
                // Calculate from object using Box3 helper (can be slow if called often)
                 objectBox = _tempBox.setFromObject(object, true); // Recursive
             }

             if (!objectBox || objectBox.isEmpty()) {
                // console.warn(`Could not get valid bounding box for collidable object: ${object.name}`);
                return; // Cannot collide without a box
             }
            // Store the calculated box for potential reuse (optional, might get stale)
            // object.userData.boundingBox = objectBox.clone(); // Clone if storing
             objectBox = _tempBox; // Use the temporary calculated box
        }


        // --- Narrow phase: AABB Collision Check ---
        if (playerBox.intersectsBox(objectBox)) {
                 // console.log(`Collision: Player intersects ${object.name || 'object'}`);

                 // --- Collision Response (Axis-Aligned Push-out) ---
                 playerBox.getCenter(_centerPlayer);
                 objectBox.getCenter(_centerObject);
                 playerBox.getSize(_sizePlayer);
                 objectBox.getSize(_sizeObject);

                 // Calculate overlap on each axis (penetration depth)
                 _overlap.x = (_sizePlayer.x / 2 + _sizeObject.x / 2) - Math.abs(_centerPlayer.x - _centerObject.x);
                 _overlap.y = (_sizePlayer.y / 2 + _sizeObject.y / 2) - Math.abs(_centerPlayer.y - _centerObject.y);
                 _overlap.z = (_sizePlayer.z / 2 + _sizeObject.z / 2) - Math.abs(_centerPlayer.z - _centerObject.z);

                 // Determine minimum positive overlap (axis of least penetration)
                 // Filter out negative overlaps (no intersection on that axis)
                 let minOverlap = Infinity;
                 let pushAxis = -1; // 0:x, 1:y, 2:z

                 if (_overlap.x > 0 && _overlap.x < minOverlap) { minOverlap = _overlap.x; pushAxis = 0; }
                 if (_overlap.y > 0 && _overlap.y < minOverlap) { minOverlap = _overlap.y; pushAxis = 1; }
                 if (_overlap.z > 0 && _overlap.z < minOverlap) { minOverlap = _overlap.z; pushAxis = 2; }

                 // Ignore negligible overlaps or if something went wrong
                 if (pushAxis === -1 || minOverlap < 0.0001) {
                     // console.log("Negligible overlap, skipping push.");
                     return;
                 }

                 _pushVector.set(0, 0, 0);

                 // Push out along the axis of minimum overlap
                 if (pushAxis === 0) { // Push on X
                     _pushVector.x = _centerPlayer.x > _centerObject.x ? minOverlap : -minOverlap;
                      this.player.velocity.x = 0; // Stop velocity in this direction
                 } else if (pushAxis === 1) { // Push on Y
                     _pushVector.y = _centerPlayer.y > _centerObject.y ? minOverlap : -minOverlap;
                      // If pushed significantly upwards (from below)
                      if (_pushVector.y > 0.01) {
                           this.player.velocity.y = Math.max(0, this.player.velocity.y); // Stop falling, allow jump impulse
                           // This can sometimes conflict with ground check raycast, careful adjustment needed
                           // Only set grounded if the push is substantial and from below
                           this.player.isOnGround = true;
                           this.player.canJump = true;
                           // console.log("Pushed up by collision, setting grounded.");
                      }
                      // If pushed downwards (hit head)
                      else if (_pushVector.y < -0.01) {
                           this.player.velocity.y = Math.min(0, this.player.velocity.y); // Stop upward velocity
                      }
                 } else { // Push on Z (pushAxis === 2)
                     _pushVector.z = _centerPlayer.z > _centerObject.z ? minOverlap : -minOverlap;
                      this.player.velocity.z = 0; // Stop velocity in this direction
                 }

                 // Apply the push correction directly to player position
                 this.player.mesh.position.add(_pushVector);

                 // IMPORTANT: Update player bounding box immediately after correction
                 // So subsequent collision checks in the same frame use the corrected position
                 this.player.updateBoundingBox();
            }
        });
    }

    // Optional: Method to update bounds for dynamic collidables if needed
    // updateDynamicObjectBounds() {
    //     this.collidableObjects.forEach(obj => {
    //         if (obj && obj.userData && obj.userData.isDynamic && obj.userData.entityReference) {
    //             // Assuming dynamic objects have an entityReference with updateBoundingBox
    //             obj.userData.entityReference.updateBoundingBox();
    //         }
    //     });
    // }
}