import * as THREE from 'three';
import { Player } from '../entities/player';
// FIX: Removed unused Entity import
// import { Entity } from '../entities/entity';

const _overlap = new THREE.Vector3(); const _centerPlayer = new THREE.Vector3();
const _centerObject = new THREE.Vector3(); const _sizePlayer = new THREE.Vector3();
const _sizeObject = new THREE.Vector3(); const _pushVector = new THREE.Vector3();
const _tempBox = new THREE.Box3(); const _objectPos = new THREE.Vector3();

export class Physics {
    private player: Player;
    private collidableObjects: THREE.Object3D[];
    private collisionCheckRadiusSq: number = 400; // 20*20

    constructor(player: Player, collidableObjects: THREE.Object3D[]) {
        this.player = player; this.collidableObjects = collidableObjects;
    }

    update(/*deltaTime: number*/): void { // FIX: Removed unused deltaTime
        if (this.player.isDead || !this.player.mesh) return; // FIX: Add mesh check
        this.handleCollisions(/*deltaTime*/); // FIX: Remove unused deltaTime
    }

    // FIX: Removed unused deltaTime parameter
    private handleCollisions(/*deltaTime: number*/): void {
        if (!this.player.mesh) return; // Should be checked in update, but safe here too

        // FIX: Check boundingBox exists on userData and is valid
        let playerBox = this.player.userData.boundingBox;
        if (!playerBox || playerBox.isEmpty()) {
            this.player.updateBoundingBox(); // Attempt recovery
            playerBox = this.player.userData.boundingBox; // Re-fetch
            // FIX: Check again after recovery attempt
            if (!playerBox || playerBox.isEmpty()) {
                console.warn("Player bounding box is invalid, skipping collision.");
                return;
            }
        }

        const playerPos = this.player.mesh.position; // Safe now as mesh exists

        this.collidableObjects.forEach(object => {
            // FIX: Check object.parent exists
            if (!object || object === this.player.mesh || !object.parent || !object.userData?.isCollidable || object.userData.isTerrain || object.userData.entityReference?.isDead) {
                return;
            }
            const userData = object.userData; // Store for reuse

            // --- Broad Phase ---
            object.getWorldPosition(_objectPos);
            if (playerPos.distanceToSquared(_objectPos) > this.collisionCheckRadiusSq) return;

            // --- Get Object Box ---
            let objectBox = userData.boundingBox as THREE.Box3 | undefined;
            if (!objectBox || objectBox.isEmpty()) { // Dynamic computation fallback
                // FIX: Check object geometry/children before calculating box
                if ((object instanceof THREE.Mesh && !object.geometry) && !(object instanceof THREE.Group && object.children.length > 0)) {
                    // Cannot compute box for object with no geometry/children
                    return;
                }
                _tempBox.setFromObject(object, true); // Use recursive version for unknown objects
                objectBox = _tempBox;
                if (objectBox.isEmpty()) return; // Cannot collide
                // userData.boundingBox = objectBox.clone(); // Optional: cache computed box (can become stale)
            }

            // --- Narrow Phase ---
            // FIX: Pass the validated playerBox
            if (playerBox.intersectsBox(objectBox)) {
                this.resolveCollision(playerBox, objectBox /*, object*/); // FIX: Pass validated playerBox, object param unused
                // Player box might change after resolution, update immediately
                this.player.updateBoundingBox();
                playerBox = this.player.userData.boundingBox; // Re-fetch potentially updated box
                // FIX: Check if player box became invalid after push (unlikely but possible)
                if (!playerBox || playerBox.isEmpty()) {
                    console.warn("Player bounding box became invalid after collision resolution.");
                    return; // Stop processing collisions for this frame if player box is bad
                }
            }
        });
    }

    // FIX: Mark object as unused if not needed
    private resolveCollision(playerBox: THREE.Box3, objectBox: THREE.Box3 /*, _object: THREE.Object3D*/): void {
        if (!this.player.mesh) return; // Check player mesh exists

        playerBox.getCenter(_centerPlayer); objectBox.getCenter(_centerObject);
        playerBox.getSize(_sizePlayer); objectBox.getSize(_sizeObject);

        // Check for zero size boxes (can happen if object is scaled to zero)
        if (_sizePlayer.x <= 0 || _sizePlayer.y <= 0 || _sizePlayer.z <= 0 ||
            _sizeObject.x <= 0 || _sizeObject.y <= 0 || _sizeObject.z <= 0) {
            return; // Cannot resolve collision with zero-sized box
        }

        _overlap.set(
            (_sizePlayer.x / 2 + _sizeObject.x / 2) - Math.abs(_centerPlayer.x - _centerObject.x),
            (_sizePlayer.y / 2 + _sizeObject.y / 2) - Math.abs(_centerPlayer.y - _centerObject.y),
            (_sizePlayer.z / 2 + _sizeObject.z / 2) - Math.abs(_centerPlayer.z - _centerObject.z)
        );

        // Ensure overlap is positive - intersection check already guarantees this, but be safe
         if (_overlap.x <= 0 || _overlap.y <= 0 || _overlap.z <= 0) {
             // This case should ideally not be reached if intersectsBox was true,
             // but floating point inaccuracies might cause issues.
             // console.warn("Resolve collision called with non-positive overlap", _overlap);
             return;
         }


        let minOverlap = Infinity; let pushAxis = -1; // 0:x, 1:y, 2:z
        // Find axis with minimum overlap
        if (_overlap.x < minOverlap) { minOverlap = _overlap.x; pushAxis = 0; }
        if (_overlap.y < minOverlap) { minOverlap = _overlap.y; pushAxis = 1; }
        if (_overlap.z < minOverlap) { minOverlap = _overlap.z; pushAxis = 2; }


        if (pushAxis === -1 || minOverlap < 1e-4) return; // Negligible overlap or error

        _pushVector.set(0, 0, 0);
        const pushMagnitude = minOverlap + 0.001; // Epsilon buffer to prevent sticking

        switch (pushAxis) {
            case 0: // X push
                _pushVector.x = (_centerPlayer.x > _centerObject.x) ? pushMagnitude : -pushMagnitude;
                // Stop velocity if pushing against movement direction
                if (Math.sign(this.player.velocity.x) !== Math.sign(_pushVector.x) && this.player.velocity.x !== 0) {
                    this.player.velocity.x = 0;
                }
                break;
            case 1: // Y push
                _pushVector.y = (_centerPlayer.y > _centerObject.y) ? pushMagnitude : -pushMagnitude;
                // Landing on object
                if (_pushVector.y > 0.01 && this.player.velocity.y <= 0) {
                    this.player.velocity.y = 0; this.player.isOnGround = true; this.player.canJump = true;
                } else if (_pushVector.y < -0.01 && this.player.velocity.y > 0) { // Hit head on object
                    this.player.velocity.y = 0;
                }
                break;
            case 2: // Z push
                _pushVector.z = (_centerPlayer.z > _centerObject.z) ? pushMagnitude : -pushMagnitude;
                 // Stop velocity if pushing against movement direction
                if (Math.sign(this.player.velocity.z) !== Math.sign(_pushVector.z) && this.player.velocity.z !== 0) {
                    this.player.velocity.z = 0;
                }
                break;
        }

        // Apply push vector to player position
        this.player.mesh.position.add(_pushVector);

        // Optional: Apply opposite force to the other object if it's dynamic
        // if (object?.userData?.isDynamic) { ... }
    }
}