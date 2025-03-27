import * as THREE from 'three';

// Reusable vectors and quaternions
const _targetPosition = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _pitchRotation = new THREE.Quaternion();
const _idealPosition = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _finalPosition = new THREE.Vector3();
const _idealLookat = new THREE.Vector3();

export class ThirdPersonCamera {
    constructor(camera, target) {
        if (!camera || !target) {
            throw new Error("Camera and target mesh are required for ThirdPersonCamera.");
        }
        this.camera = camera; // The THREE.PerspectiveCamera instance
        this.target = target; // The object the camera follows (player mesh)

        // Desired offset from target (behind and slightly above)
        this.idealOffset = new THREE.Vector3(0, 2.5, 5.0);
        this.minOffsetDistance = 1.5; // Minimum distance to prevent clipping into player
        this.maxOffsetDistance = 12.0; // Max zoom out

        // Camera rotation (Pitch) controlled by mouse Y
        this.pitchAngle = 0.15; // Initial slight downward angle
        this.minPitch = -Math.PI / 3; // Limit looking down
        this.maxPitch = Math.PI / 2.5; // Limit looking up
        this.pitchSensitivity = 0.0025;

        // Smoothing factor for camera movement (use powers for frame-rate independence)
        // Lower base value means slower interpolation
        this.lerpAlphaPosition = 0.05; // Controls how quickly the camera follows position
        this.lerpAlphaLookat = 0.1;   // Controls how quickly the camera adjusts its look-at point

         // Collision detection for camera
         this.collisionRaycaster = new THREE.Raycaster();
         this.collisionOffset = 0.3; // Keep camera slightly away from obstacles

         // Initial position setup
         this.currentPosition = new THREE.Vector3();
         this.currentLookat = new THREE.Vector3();
         this.target.getWorldPosition(this.currentLookat); // Start looking at target
         this.currentLookat.y += 1.0; // Look slightly above base
         this.update(0.016, []); // Initial update to set reasonable start position
         this.camera.position.copy(this.currentPosition);
         this.camera.lookAt(this.currentLookat);
    }

    // Called from Controls system when pointer is locked
     handleMouseInput(deltaX, deltaY) {
         // Yaw (left/right) rotation is handled by rotating the player mesh in Controls
         // Pitch (up/down) rotation is handled here
         this.pitchAngle -= deltaY * this.pitchSensitivity;
         this.pitchAngle = THREE.MathUtils.clamp(this.pitchAngle, this.minPitch, this.maxPitch);
     }


    update(deltaTime, collidables = []) {
        if (!this.target) return;

        // 1. Calculate Target Position and Orientation
        this.target.getWorldPosition(_targetPosition);
        const targetQuaternion = this.target.quaternion; // Player's rotation

        // 2. Calculate Ideal Camera Position based on Offset, Pitch, and Yaw
        _offset.copy(this.idealOffset);

         // Apply pitch rotation to the offset vector around the X-axis
         _pitchRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitchAngle);
         _offset.applyQuaternion(_pitchRotation);

        // Apply target's yaw rotation (Y-axis rotation) to the offset
        _offset.applyQuaternion(targetQuaternion);

        // Calculate the ideal position in world space
        _idealPosition.copy(_targetPosition).add(_offset);

        // 3. Check for Camera Collision
        // Raycast from the target towards the ideal camera position
        _cameraDirection.copy(_idealPosition).sub(_targetPosition);
        const idealDistance = _cameraDirection.length();
        _cameraDirection.normalize();

        // Set raycaster parameters
        // Start ray slightly in front of target center to avoid hitting target itself initially
        const rayOrigin = _targetPosition.clone().addScaledVector(_cameraDirection, 0.1);
        this.collisionRaycaster.set(rayOrigin, _cameraDirection);
        this.collisionRaycaster.far = Math.max(0, idealDistance - 0.1); // Check up to the ideal position minus start offset
        this.collisionRaycaster.near = 0;

         // Find closest collision (ignore player itself and non-collidable objects)
         const collisionCheckObjects = collidables.filter(obj =>
             obj !== this.target && obj.userData.isCollidable && !obj.userData.isPlayer // Ensure we don't check against the player mesh itself
         );
         const intersects = this.collisionRaycaster.intersectObjects(collisionCheckObjects, true); // recursive check

         let actualDistance = idealDistance;
         if (intersects.length > 0) {
             // Find the closest valid intersection point
             let closestDistance = idealDistance;
             for(const intersect of intersects) {
                // Only consider intersections closer than the ideal distance
                if (intersect.distance < closestDistance) {
                    closestDistance = intersect.distance;
                }
             }
             // Adjust distance, ensuring a minimum gap from target and collision point
             actualDistance = Math.max(this.minOffsetDistance, closestDistance + 0.1 - this.collisionOffset); // Add back the 0.1 offset
         }

         // Clamp distance if needed (e.g., for zoom functionality)
         actualDistance = Math.min(this.maxOffsetDistance, actualDistance);


         // 4. Calculate Final Camera Position using adjusted distance
         _finalPosition.copy(_targetPosition).addScaledVector(_cameraDirection, actualDistance);


        // 5. Calculate Ideal Look-at Point (slightly above target's base)
        // This helps keep the target centered vertically in the frame
        _idealLookat.copy(_targetPosition);
        // Adjust based on player height if available
        const targetHeight = this.target.userData?.height || 1.8;
        _idealLookat.y += targetHeight * 0.6; // Look at roughly chest height


        // 6. Smoothly Interpolate (Lerp) Camera Position and Look-at
        // Use frame-rate independent lerp: alpha = 1 - base^deltaTime
        const posLerp = 1.0 - Math.pow(this.lerpAlphaPosition, deltaTime);
        const lookLerp = 1.0 - Math.pow(this.lerpAlphaLookat, deltaTime);

        this.currentPosition.lerp(_finalPosition, posLerp);
        this.currentLookat.lerp(_idealLookat, lookLerp);

        // 7. Apply Position and Look-at to the actual camera
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }
}