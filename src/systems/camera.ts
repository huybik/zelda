import * as THREE from 'three';
import { smoothVectorLerp } from '../utils/helpers'; // Use smooth lerp helper

// Reusable vectors and quaternions
const _targetPosition = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _idealPosition = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _finalPosition = new THREE.Vector3();
const _idealLookat = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();

export class ThirdPersonCamera {
    public camera: THREE.PerspectiveCamera;
    public target: THREE.Object3D; // The object the camera follows

    // Camera positioning properties
    public idealOffset: THREE.Vector3;
    public minOffsetDistance: number;
    public maxOffsetDistance: number;

    // Pitch control
    public pitchAngle: number;
    public minPitch: number;
    public maxPitch: number;
    private pitchSensitivity: number;

    // Smoothing factors (lower base = slower interpolation)
    private lerpAlphaPositionBase: number = 0.05;
    private lerpAlphaLookatBase: number = 0.1;

    // Collision detection
    private collisionRaycaster: THREE.Raycaster;
    private collisionOffset: number; // Minimum distance from obstacle

    // Internal state for smoothing
    private currentPosition: THREE.Vector3;
    private currentLookat: THREE.Vector3;

    constructor(camera: THREE.PerspectiveCamera, target: THREE.Object3D) {
        if (!camera || !target) {
            throw new Error("Camera and target mesh are required for ThirdPersonCamera.");
        }
        this.camera = camera;
        this.target = target;

        this.idealOffset = new THREE.Vector3(0, 2.5, 5.0); // Default offset
        this.minOffsetDistance = 1.5;
        this.maxOffsetDistance = 12.0;

        this.pitchAngle = 0.15; // Initial downward angle
        this.minPitch = -Math.PI / 3; // Approx -60 degrees
        this.maxPitch = Math.PI / 2.5; // Approx +72 degrees
        this.pitchSensitivity = 0.0025;

        this.collisionRaycaster = new THREE.Raycaster();
        this.collisionOffset = 0.3; // Keep camera slightly away

        // Initial state setup
        this.currentPosition = new THREE.Vector3();
        this.currentLookat = new THREE.Vector3();
        this.target.getWorldPosition(this.currentLookat); // Start looking at target
        this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6; // Look slightly above base
        // Perform an initial update to set a reasonable start position
        this.update(0.016, []); // Use small delta, no collidables needed initially
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }

    // Called from Controls system when pointer is locked
    public handleMouseInput(deltaX: number, deltaY: number): void {
        // Yaw rotation is handled by rotating the player mesh in Controls
        // Pitch (up/down) rotation is handled here by adjusting pitchAngle
        this.pitchAngle -= deltaY * this.pitchSensitivity;
        this.pitchAngle = THREE.MathUtils.clamp(this.pitchAngle, this.minPitch, this.maxPitch);
    }

    public update(deltaTime: number, collidables: THREE.Object3D[] = []): void {
        if (!this.target) return;

        // 1. Calculate Target Position and Player's World Quaternion
        this.target.getWorldPosition(_targetPosition);
        const targetQuaternion = this.target.quaternion;

        // 2. Calculate Ideal Camera Position (Offset + Rotations)
        _offset.copy(this.idealOffset)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), this.pitchAngle) // Apply pitch rotation
            .applyQuaternion(targetQuaternion);                           // Apply target's yaw rotation

        _idealPosition.copy(_targetPosition).add(_offset);

        // 3. Camera Collision Check
        _cameraDirection.copy(_idealPosition).sub(_targetPosition);
        let idealDistance = _cameraDirection.length();
        _cameraDirection.normalize();

        // Raycast from near target towards ideal camera position
        _rayOrigin.copy(_targetPosition).addScaledVector(_cameraDirection, 0.2); // Start ray slightly ahead of target center
        this.collisionRaycaster.set(_rayOrigin, _cameraDirection);
        this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2); // Check up to ideal position (minus start offset)
        this.collisionRaycaster.near = 0;

        // Filter collidables (exclude player, non-collidables)
        const collisionCheckObjects = collidables.filter(obj =>
            obj !== this.target && obj?.userData?.isCollidable
        );
        const intersects = this.collisionRaycaster.intersectObjects(collisionCheckObjects, true);

        let actualDistance = idealDistance;
        if (intersects.length > 0) {
            // Find the closest valid intersection
             actualDistance = intersects.reduce((minDist, intersect) => Math.min(minDist, intersect.distance), idealDistance);
             // Adjust distance: Add back the start offset and subtract the collision buffer
             actualDistance = actualDistance + 0.2 - this.collisionOffset;
             // Ensure minimum distance from target
             actualDistance = Math.max(this.minOffsetDistance, actualDistance);
        }

        // Clamp distance if needed (e.g., for zoom functionality or max range)
        actualDistance = THREE.MathUtils.clamp(actualDistance, this.minOffsetDistance, this.maxOffsetDistance);

        // 4. Calculate Final Camera Position
        _finalPosition.copy(_targetPosition).addScaledVector(_cameraDirection, actualDistance);

        // 5. Calculate Ideal Look-at Point (slightly above target's base)
        const targetHeight = this.target.userData?.height ?? 1.8;
        _idealLookat.copy(_targetPosition).add(new THREE.Vector3(0, targetHeight * 0.6, 0));

        // 6. Smoothly Interpolate Camera Position and Look-at using helper
        smoothVectorLerp(this.currentPosition, _finalPosition, this.lerpAlphaPositionBase, deltaTime);
        smoothVectorLerp(this.currentLookat, _idealLookat, this.lerpAlphaLookatBase, deltaTime);

        // 7. Apply Final Position and Look-at
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }
}