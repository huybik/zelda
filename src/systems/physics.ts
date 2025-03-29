import * as THREE from 'three';
import { Player } from '../entities/player';
import { Entity } from '../entities/entity';

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

    update(deltaTime: number): void {
        if (this.player.isDead) return;
        this.handleCollisions(deltaTime);
    }

    private handleCollisions(deltaTime: number): void {
        const playerBox = this.player.userData.boundingBox;
        if (!playerBox || playerBox.isEmpty()) {
            this.player.updateBoundingBox(); // Attempt recovery
            if (!this.player.userData.boundingBox || this.player.userData.boundingBox.isEmpty()) return; // Still bad
        }
        const playerPos = this.player.mesh.position;

        this.collidableObjects.forEach(object => {
            const userData = object?.userData;
            // --- Filters ---
            if (!object || object === this.player.mesh || !userData?.isCollidable || userData.isTerrain || !object.parent || userData.entityReference?.isDead) {
                return;
            }
            // --- Broad Phase ---
            object.getWorldPosition(_objectPos);
            if (playerPos.distanceToSquared(_objectPos) > this.collisionCheckRadiusSq) return;

            // --- Get Object Box ---
            let objectBox = userData.boundingBox as THREE.Box3 | undefined;
            if (!objectBox || objectBox.isEmpty()) { // Dynamic computation fallback
                _tempBox.setFromObject(object, true); // Use recursive version for unknown objects
                objectBox = _tempBox;
                if (objectBox.isEmpty()) return; // Cannot collide
                // userData.boundingBox = objectBox.clone(); // Optional: cache computed box (can become stale)
            }

            // --- Narrow Phase ---
            if (playerBox.intersectsBox(objectBox)) {
                this.resolveCollision(playerBox, objectBox, object);
                this.player.updateBoundingBox(); // Re-update player box *immediately* after push
            }
        });
    }

    private resolveCollision(playerBox: THREE.Box3, objectBox: THREE.Box3, object: THREE.Object3D): void {
        playerBox.getCenter(_centerPlayer); objectBox.getCenter(_centerObject);
        playerBox.getSize(_sizePlayer); objectBox.getSize(_sizeObject);

        _overlap.set(
            (_sizePlayer.x / 2 + _sizeObject.x / 2) - Math.abs(_centerPlayer.x - _centerObject.x),
            (_sizePlayer.y / 2 + _sizeObject.y / 2) - Math.abs(_centerPlayer.y - _centerObject.y),
            (_sizePlayer.z / 2 + _sizeObject.z / 2) - Math.abs(_centerPlayer.z - _centerObject.z)
        );

        let minOverlap = Infinity; let pushAxis = -1; // 0:x, 1:y, 2:z
        if (_overlap.x > 0 && _overlap.x < minOverlap) { minOverlap = _overlap.x; pushAxis = 0; }
        if (_overlap.y > 0 && _overlap.y < minOverlap) { minOverlap = _overlap.y; pushAxis = 1; }
        if (_overlap.z > 0 && _overlap.z < minOverlap) { minOverlap = _overlap.z; pushAxis = 2; }

        if (pushAxis === -1 || minOverlap < 1e-4) return; // Negligible overlap

        _pushVector.set(0, 0, 0);
        const pushMagnitude = minOverlap + 0.001; // Epsilon buffer

        switch (pushAxis) {
            case 0: // X push
                _pushVector.x = (_centerPlayer.x > _centerObject.x) ? pushMagnitude : -pushMagnitude;
                if (Math.sign(this.player.velocity.x) === Math.sign(_pushVector.x)) this.player.velocity.x = 0;
                break;
            case 1: // Y push
                _pushVector.y = (_centerPlayer.y > _centerObject.y) ? pushMagnitude : -pushMagnitude;
                if (_pushVector.y > 0.01 && this.player.velocity.y <= 0) { // Landed
                    this.player.velocity.y = 0; this.player.isOnGround = true; this.player.canJump = true;
                } else if (_pushVector.y < -0.01 && this.player.velocity.y > 0) { // Hit head
                    this.player.velocity.y = 0;
                }
                break;
            case 2: // Z push
                _pushVector.z = (_centerPlayer.z > _centerObject.z) ? pushMagnitude : -pushMagnitude;
                if (Math.sign(this.player.velocity.z) === Math.sign(_pushVector.z)) this.player.velocity.z = 0;
                break;
        }
        this.player.mesh.position.add(_pushVector);
    }
}