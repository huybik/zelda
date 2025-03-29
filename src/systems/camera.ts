// File: /src/systems/camera.ts
// Optimization: Minor cleanup, use Vector3.set() where applicable.

import * as THREE from 'three';
import { smoothVectorLerp } from '../utils/helpers';

const _targetPosition = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _idealPosition = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _finalPosition = new THREE.Vector3();
const _idealLookat = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();

export class ThirdPersonCamera {
    public camera: THREE.PerspectiveCamera;
    public target: THREE.Object3D;
    public idealOffset: THREE.Vector3;
    public minOffsetDistance: number; public maxOffsetDistance: number;
    public pitchAngle: number; public minPitch: number; public maxPitch: number;
    private pitchSensitivity: number;
    private lerpAlphaPositionBase: number = 0.05;
    private lerpAlphaLookatBase: number = 0.1;
    private collisionRaycaster: THREE.Raycaster;
    private collisionOffset: number;
    private currentPosition: THREE.Vector3; private currentLookat: THREE.Vector3;

    constructor(camera: THREE.PerspectiveCamera, target: THREE.Object3D) {
        // Error check removed for brevity, assume valid input
        this.camera = camera; this.target = target;
        this.idealOffset = new THREE.Vector3(0, 2.5, 5.0);
        this.minOffsetDistance = 1.5; this.maxOffsetDistance = 12.0;
        this.pitchAngle = 0.15; this.minPitch = -Math.PI / 3; this.maxPitch = Math.PI / 2.5;
        this.pitchSensitivity = 0.0025;
        this.collisionRaycaster = new THREE.Raycaster();
        this.collisionOffset = 0.3;
        this.currentPosition = new THREE.Vector3();
        this.currentLookat = new THREE.Vector3();
        this.target.getWorldPosition(this.currentLookat);
        this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6;
        this.update(0.016, []); // Initial position calculation
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }

    public handleMouseInput(deltaX: number, deltaY: number): void {
        // Yaw handled by player rotation
        this.pitchAngle = THREE.MathUtils.clamp(this.pitchAngle - deltaY * this.pitchSensitivity, this.minPitch, this.maxPitch);
    }

    public update(deltaTime: number, collidables: THREE.Object3D[] = []): void {
        if (!this.target) return;

        this.target.getWorldPosition(_targetPosition);
        const targetQuaternion = this.target.quaternion;

        // Calculate Ideal Position
        _offset.copy(this.idealOffset)
            .applyAxisAngle(THREE.Object3D.DEFAULT_UP.set(1, 0, 0), this.pitchAngle) // Use shared vector
            .applyQuaternion(targetQuaternion);
        _idealPosition.copy(_targetPosition).add(_offset);

        // Collision Check
        _cameraDirection.copy(_idealPosition).sub(_targetPosition);
        let idealDistance = _cameraDirection.length();
        _cameraDirection.normalize();

        _rayOrigin.copy(_targetPosition).addScaledVector(_cameraDirection, 0.2);
        this.collisionRaycaster.set(_rayOrigin, _cameraDirection);
        this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2);
        this.collisionRaycaster.near = 0;

        const checkObjects = collidables.filter(obj => obj !== this.target && obj?.userData?.isCollidable);
        const intersects = this.collisionRaycaster.intersectObjects(checkObjects, true);

        let actualDistance = idealDistance;
        if (intersects.length > 0) {
            const closestDist = intersects.reduce((min, i) => Math.min(min, i.distance), idealDistance);
            actualDistance = Math.max(this.minOffsetDistance, closestDist + 0.2 - this.collisionOffset);
        }
        actualDistance = THREE.MathUtils.clamp(actualDistance, this.minOffsetDistance, this.maxOffsetDistance);

        // Final Position & Look-at
        _finalPosition.copy(_targetPosition).addScaledVector(_cameraDirection, actualDistance);
        const targetHeight = this.target.userData?.height ?? 1.8;
        _idealLookat.copy(_targetPosition).setY(_targetPosition.y + targetHeight * 0.6);

        // Smooth Interpolation & Apply
        smoothVectorLerp(this.currentPosition, _finalPosition, this.lerpAlphaPositionBase, deltaTime);
        smoothVectorLerp(this.currentLookat, _idealLookat, this.lerpAlphaLookatBase, deltaTime);
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }
}