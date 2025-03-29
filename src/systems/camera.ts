
import * as THREE from 'three';
import { smoothVectorLerp } from '../utils/helpers';

const _targetPosition = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _idealPosition = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _finalPosition = new THREE.Vector3();
const _idealLookat = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _upVector = new THREE.Vector3(0, 1, 0); // Define reusable up vector

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
        if (!camera || !target) throw new Error("Camera and target must be provided.");
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
        // FIX: Use optional chaining for userData access
        this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6;
        // Calculate initial position safely
        const initialOffset = this.idealOffset.clone().applyQuaternion(this.target.quaternion);
        this.currentPosition.copy(this.target.position).add(initialOffset);
        // Call update once to refine position considering pitch and potential collisions
        this.update(0.016, []); // Initial position calculation using small dt
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }

    // FIX: Removed unused deltaX parameter
    public handleMouseInput(/*deltaX: number,*/ deltaY: number): void {
        // Yaw handled by player rotation externally
        this.pitchAngle = THREE.MathUtils.clamp(this.pitchAngle - deltaY * this.pitchSensitivity, this.minPitch, this.maxPitch);
    }

    public update(deltaTime: number, collidables: THREE.Object3D[] = []): void {
        if (!this.target) return;

        this.target.getWorldPosition(_targetPosition);
        const targetQuaternion = this.target.quaternion; // Assuming target has quaternion

        // Calculate Ideal Position
        // Apply pitch rotation around the target's local X-axis *before* applying target's world rotation
        _offset.copy(this.idealOffset);
        // Create a quaternion representing the pitch rotation around the X axis
        const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitchAngle);
        // Apply pitch rotation first
        _offset.applyQuaternion(pitchQuaternion);
        // Then apply the target's world rotation
        _offset.applyQuaternion(targetQuaternion);

        _idealPosition.copy(_targetPosition).add(_offset);

        // Collision Check
        _cameraDirection.copy(_idealPosition).sub(_targetPosition);
        let idealDistance = _cameraDirection.length();
        if (idealDistance < 1e-6) { idealDistance = 1e-6; } // Avoid zero length
        _cameraDirection.divideScalar(idealDistance); // Normalize safely

        _rayOrigin.copy(_targetPosition).addScaledVector(_cameraDirection, 0.2); // Start ray slightly away from target center
        this.collisionRaycaster.set(_rayOrigin, _cameraDirection);
        this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2); // Adjust far based on offset origin
        this.collisionRaycaster.near = 0;

        // FIX: Use optional chaining for userData access
        const checkObjects = collidables.filter(obj => obj !== this.target && obj?.userData?.isCollidable === true);
        const intersects = this.collisionRaycaster.intersectObjects(checkObjects, true);

        let actualDistance = idealDistance;
        if (intersects.length > 0) {
            // Find the closest valid intersection point's distance along the ray
            const closestDist = intersects.reduce((min, i) => Math.min(min, i.distance), idealDistance);
            // Calculate distance from target center, adding back the origin offset and subtracting collision buffer
            actualDistance = Math.max(this.minOffsetDistance, closestDist + 0.2 - this.collisionOffset);
        }
        actualDistance = THREE.MathUtils.clamp(actualDistance, this.minOffsetDistance, this.maxOffsetDistance);

        // Final Position & Look-at
        _finalPosition.copy(_targetPosition).addScaledVector(_cameraDirection, actualDistance);
        // FIX: Use optional chaining for userData access
        const targetHeight = this.target.userData?.height ?? 1.8;
        _idealLookat.copy(_targetPosition); // Start with target base position
         // Add vertical offset based on height, ensures lookAt point is roughly torso level
        _idealLookat.y += targetHeight * 0.6;


        // Smooth Interpolation & Apply
        smoothVectorLerp(this.currentPosition, _finalPosition, this.lerpAlphaPositionBase, deltaTime);
        smoothVectorLerp(this.currentLookat, _idealLookat, this.lerpAlphaLookatBase, deltaTime);
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }
}