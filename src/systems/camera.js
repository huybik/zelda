import * as THREE from 'three';

export class ThirdPersonCamera {
    constructor(camera, target) {
        this.camera = camera; // The THREE.PerspectiveCamera instance
        this.target = target; // The object the camera follows (player mesh)

        this.currentPosition = new THREE.Vector3();
        this.currentLookat = new THREE.Vector3();

        // Camera position relative to target (behind and slightly above)
        this.idealOffset = new THREE.Vector3(0, 2.5, 5.0);
        this.minOffsetDistance = 2.0; // Minimum distance to prevent clipping into player
        this.maxOffsetDistance = 10.0; // Max zoom out (can be added later)

        // Camera rotation (Pitch) controlled by mouse Y
        this.pitchAngle = 0.1; // Initial slight downward angle
        this.minPitch = -Math.PI / 4; // Limit looking down too much
        this.maxPitch = Math.PI / 3;   // Limit looking up too much
        this.pitchSensitivity = 0.002;

        // Smoothing factor for camera movement
        this.lerpFactorPosition = 0.1; // Controls how quickly the camera follows position
        this.lerpFactorLookat = 0.15; // Controls how quickly the camera adjusts its look-at point

         // Collision detection for camera
         this.collisionRaycaster = new THREE.Raycaster();
         this.collisionOffset = 0.5; // Keep camera slightly away from obstacles
    }

    // Called from Controls system when pointer is locked
     handleMouseInput(deltaX, deltaY) {
         // Yaw (left/right) rotation is handled by rotating the player mesh in Controls
         // Pitch (up/down) rotation is handled here
         this.pitchAngle -= deltaY * this.pitchSensitivity;
         this.pitchAngle = THREE.MathUtils.clamp(this.pitchAngle, this.minPitch, this.maxPitch);
     }


    update(deltaTime, collidables = []) {
        // 1. Calculate Ideal Camera Position
        const targetPosition = this.target.position.clone();
        // Apply the offset relative to the target's rotation
        const offset = this.idealOffset.clone();

         // Apply pitch rotation to the offset
         const pitchRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitchAngle);
         offset.applyQuaternion(pitchRotation);

        // Apply target's yaw rotation (Y-axis rotation) to the offset
        offset.applyQuaternion(this.target.quaternion);

        let idealPosition = targetPosition.clone().add(offset);

        // 2. Check for Camera Collision
         const cameraDirection = idealPosition.clone().sub(targetPosition).normalize();
         const cameraDistance = this.idealOffset.length(); // Original desired distance
         this.collisionRaycaster.set(targetPosition, cameraDirection);
         this.collisionRaycaster.far = cameraDistance + this.collisionOffset; // Check up to the ideal position plus buffer

         // Find closest collision (ignore player itself)
         const collisionCheckObjects = collidables.filter(obj => obj !== this.target && obj.userData.isCollidable);
         const intersects = this.collisionRaycaster.intersectObjects(collisionCheckObjects, true); // recursive check

         let actualDistance = cameraDistance;
         if (intersects.length > 0) {
             // Find the closest intersection point
             let closestDistance = cameraDistance;
             intersects.forEach(intersect => {
                 // Make sure intersection is not *behind* the target relative to camera direction
                  if (intersect.distance < closestDistance) {
                      closestDistance = intersect.distance;
                  }
             });
             // Adjust distance, ensuring a minimum gap
             actualDistance = Math.max(this.minOffsetDistance, closestDistance - this.collisionOffset);
         }


         // 3. Calculate Final Camera Position using adjusted distance
         const finalPosition = targetPosition.clone().add(cameraDirection.multiplyScalar(actualDistance));


        // 4. Calculate Ideal Look-at Point (slightly above target's base)
        // This helps keep the target centered vertically in the frame
        const idealLookat = targetPosition.clone();
        idealLookat.y += 1.0; // Adjust this value based on player height/preference

        // 5. Smoothly Interpolate (Lerp) Camera Position and Look-at
        const posLerp = 1.0 - Math.pow(this.lerpFactorPosition, deltaTime); // Frame-rate independent lerp calculation
        const lookLerp = 1.0 - Math.pow(this.lerpFactorLookat, deltaTime);

        this.currentPosition.lerp(finalPosition, posLerp);
        this.currentLookat.lerp(idealLookat, lookLerp);

        // 6. Apply Position and Look-at to the actual camera
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }
}