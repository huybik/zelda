import * as THREE from 'three';

export class Physics {
    constructor(player, collidableObjects) {
        this.player = player;
        this.collidableObjects = collidableObjects; // Array of meshes/groups to collide with
    }

    update(deltaTime) {
        // Currently, player handles its own gravity and ground check.
        // This system focuses on collision *response* after movement.

        this.handleCollisions(deltaTime);
    }

    handleCollisions(deltaTime) {
    if (!this.player || this.player.isDead) return;

    const playerBox = this.player.boundingBox;
    if (!playerBox || playerBox.isEmpty()) return;

    const playerPos = this.player.mesh.position;
    // Define a maximum distance for collision checks (e.g., 10 units)
    const collisionCheckRadiusSq = 10 * 10; // Use squared distance for efficiency

    this.collidableObjects.forEach(object => {
        // Basic Checks
        if (object === this.player.mesh || !object.userData.isCollidable || object.userData.isTerrain) {
             return;
        }

        // ***** OPTIMIZATION START *****
        // Broad phase: Check distance before detailed AABB check
        // Ensure the object has a position (might be a Group without position set directly)
        const objectPos = object.position;
        if (playerPos.distanceToSquared(objectPos) > collisionCheckRadiusSq) {
             // Object is too far away, skip detailed check
             return;
        }
        // ***** OPTIMIZATION END *****


        // Get object's bounding box (ensure it's up-to-date)
        let objectBox = object.userData.boundingBox;
        // ... (rest of the bounding box calculation logic remains the same) ...
        if (!objectBox) {
            if (object.geometry) {
                // ... calculation ...
            } else if (object instanceof THREE.Group){
                objectBox = new THREE.Box3().setFromObject(object, true);
            } else {
                return;
            }
            object.userData.boundingBox = objectBox;
        }
        if (objectBox.isEmpty()) return;

        // --- Simple AABB Collision Check ---
        if (playerBox.intersectsBox(objectBox)) {
                 // console.log(`Collision detected between Player and ${object.name || 'object'}`);

                 // --- Collision Response (Axis-Aligned Push-out) ---
                 const overlap = new THREE.Vector3();
                 const centerPlayer = new THREE.Vector3();
                 const centerObject = new THREE.Vector3();
                 playerBox.getCenter(centerPlayer);
                 objectBox.getCenter(centerObject);

                 const sizePlayer = new THREE.Vector3();
                 const sizeObject = new THREE.Vector3();
                 playerBox.getSize(sizePlayer);
                 objectBox.getSize(sizeObject);

                 // Calculate overlap on each axis
                 overlap.x = (sizePlayer.x / 2 + sizeObject.x / 2) - Math.abs(centerPlayer.x - centerObject.x);
                 overlap.y = (sizePlayer.y / 2 + sizeObject.y / 2) - Math.abs(centerPlayer.y - centerObject.y);
                 overlap.z = (sizePlayer.z / 2 + sizeObject.z / 2) - Math.abs(centerPlayer.z - centerObject.z);

                 // Determine minimum overlap axis (axis of least penetration)
                 let minOverlap = Math.min(overlap.x, overlap.y, overlap.z);

                // Ignore negligible overlaps
                 if (minOverlap < 0.001) return;

                 const pushVector = new THREE.Vector3();

                 // Push out along the axis of minimum overlap
                 if (minOverlap === overlap.x) {
                     pushVector.x = centerPlayer.x > centerObject.x ? overlap.x : -overlap.x;
                      this.player.velocity.x = 0; // Stop velocity in this direction
                 } else if (minOverlap === overlap.y) {
                     pushVector.y = centerPlayer.y > centerObject.y ? overlap.y : -overlap.y;
                      // If pushed from below, treat as landing (stop downward velocity)
                      if (pushVector.y > 0) {
                           this.player.velocity.y = Math.max(0, this.player.velocity.y); // Stop falling
                           this.player.isOnGround = true; // Consider grounded if pushed from below
                           this.player.canJump = true;
                      } else {
                           // Hit head? Stop upward velocity.
                           this.player.velocity.y = Math.min(0, this.player.velocity.y);
                      }
                 } else { // minOverlap === overlap.z
                     pushVector.z = centerPlayer.z > centerObject.z ? overlap.z : -overlap.z;
                      this.player.velocity.z = 0; // Stop velocity in this direction
                 }

                 // Apply the push correction directly to player position
                 this.player.mesh.position.add(pushVector);

                 // Update player bounding box immediately after correction
                 this.player.updateBoundingBox();
            }
        });
    }
}