import * as THREE from 'three';
import { Entity } from './entity.js';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDirection = new THREE.Vector3();
const _moveVelocity = new THREE.Vector3();
const _groundCheckOrigin = new THREE.Vector3();
const _groundCheckDirection = new THREE.Vector3(0, -1, 0);


export class Player extends Entity {
    constructor(scene, position) {
        super(scene, position, 'Player');

        this.userData.isPlayer = true;
        this.userData.isCollidable = true;
        this.userData.isInteractable = false; // Player itself isn't interactable via 'E'

        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.maxStamina = 100;
        this.stamina = this.maxStamina;
        this.walkSpeed = 4.0;
        this.runSpeed = 8.0;
        this.jumpForce = 8.0; // Initial upward velocity on jump
        this.staminaDrainRate = 15; // Per second while sprinting
        this.staminaRegenRate = 10; // Per second while not sprinting/exhausted
        this.staminaJumpCost = 10;
        this.canJump = false; // Determined by ground check
        this.isSprinting = false;
        this.isExhausted = false; // Flag when stamina is fully depleted
        this.exhaustionThreshold = 20; // Stamina must reach this value to recover from exhaustion

        // Movement state (updated by Controls system)
        this.moveState = {
            forward: 0, // -1, 0, 1
            right: 0,   // -1, 0, 1
            jump: false, // Will be set to true briefly by Controls
            sprint: false,
        };

        // Physics related
        this.gravity = -25; // Acceleration due to gravity
        this.isOnGround = false;
        this.groundCheckDistance = 0.15; // How far below the player base to check for ground (increased slightly)
        this.lastVelocityY = 0; // To detect landing

        // Player Model (Simple Blocky Humanoid)
        this.createModel();
        this.updateBoundingBox(); // Initial bounding box calculation

        // References to game systems needed by player
        this.questLog = null;
        this.eventLog = null;
    }

    setJournal(questLog, eventLog) {
        this.questLog = questLog;
        this.eventLog = eventLog;
    }


    createModel() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x0077ff }); // Blue body
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 }); // Beige head
        const limbMat = bodyMat; // Same color limbs for simplicity

        // Body
        const bodyHeight = 1.0;
        const bodyGeo = new THREE.BoxGeometry(0.8, bodyHeight, 0.5);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.7 + (bodyHeight / 2) - 0.5; // Adjust position based on actual height if needed, aiming for feet at 0
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true; // Player can receive shadows
        this.mesh.add(bodyMesh);

        // Head
        const headRadius = 0.3;
        const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        // Position head relative to body top (bodyMesh.position.y is center)
        headMesh.position.y = bodyMesh.position.y + bodyHeight / 2 + headRadius;
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        // Simple Limbs (Cylinders) - could be animated later
        const limbRadius = 0.15;
        const armLength = 0.8;
        const legLength = 0.9; // Total leg length

        // Left Arm
        const leftArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius*0.9, armLength, 8);
        this.leftArm = new THREE.Mesh(leftArmGeo, limbMat);
        // Position arm relative to body center, slightly forward
        this.leftArm.position.set(-0.5, bodyMesh.position.y + 0.2, 0.1);
        this.leftArm.geometry.translate(0, -armLength / 2, 0); // Set origin to shoulder
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        // Right Arm
        const rightArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius*0.9, armLength, 8);
        this.rightArm = new THREE.Mesh(rightArmGeo, limbMat);
        this.rightArm.position.set(0.5, bodyMesh.position.y + 0.2, 0.1);
        this.rightArm.geometry.translate(0, -armLength / 2, 0); // Set origin to shoulder
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // Left Leg
        const leftLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        this.leftLeg = new THREE.Mesh(leftLegGeo, limbMat);
        // Position leg relative to body bottom
        this.leftLeg.position.set(-0.2, bodyMesh.position.y - bodyHeight/2, 0);
        this.leftLeg.geometry.translate(0, -legLength / 2, 0); // Set origin to hip
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        // Right Leg
        const rightLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        this.rightLeg = new THREE.Mesh(rightLegGeo, limbMat);
        this.rightLeg.position.set(0.2, bodyMesh.position.y - bodyHeight/2, 0);
        this.rightLeg.geometry.translate(0, -legLength / 2, 0); // Set origin to hip
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);

         // Set player height reference for physics/camera
         // Ensure PLAYER_HEIGHT roughly matches model visual height from origin (feet)
         this.mesh.userData.height = PLAYER_HEIGHT; // Based on constant
         this.mesh.userData.radius = PLAYER_RADIUS;
    }

     // Overrides base Entity update
    update(deltaTime, moveState, collidables) {
         if (this.isDead) return;

         this.moveState = moveState; // Update movement intention from controls

         const previousY = this.mesh.position.y; // Store position before updates
         const wasOnGround = this.isOnGround;

         this.handleStamina(deltaTime);
         this.handleMovement(deltaTime); // Calculates horizontal velocity based on input/state
         this.applyGravity(deltaTime); // Modifies vertical velocity

         // Apply calculated velocity to position
         this.mesh.position.x += this.velocity.x * deltaTime;
         this.mesh.position.y += this.velocity.y * deltaTime;
         this.mesh.position.z += this.velocity.z * deltaTime;

         // Check ground *after* potential vertical movement
         this.checkGround(collidables);

         // Detect landing after fall/jump
         if (this.isOnGround && !wasOnGround && this.lastVelocityY < -1.0) {
             this.handleFallDamage(Math.abs(this.lastVelocityY));
         }
         this.lastVelocityY = this.velocity.y; // Store velocity for next frame's landing check

         // Collision response is handled by the Physics system *after* this update,
         // potentially adjusting the mesh position again.

         // Apply simple walking animation
         this.animateMovement(deltaTime);

         // Update bounding box *after* all position changes for this frame
         // (including potential physics push-out in the next step of the game loop)
         // It's often better to update BB *before* collision checks in the physics system.
         // Let's update it here, assuming physics system uses this updated box.
         this.updateBoundingBox();

         // Reset jump request only after checking it in handleMovement
         this.moveState.jump = false;
    }


    handleStamina(deltaTime) {
        const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
        // Can sprint only if moving, not exhausted, and has *some* stamina
        this.isSprinting = this.moveState.sprint && isMoving && !this.isExhausted && this.stamina > 0;

        if (this.isSprinting) {
            this.stamina -= this.staminaDrainRate * deltaTime;
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.isExhausted = true; // Become exhausted
                this.isSprinting = false; // Stop sprinting
                 if(this.eventLog) this.eventLog.addEntry("You are exhausted!");
            }
        } else {
             // If exhausted, regen slowly until threshold is met
             if(this.isExhausted) {
                 this.stamina += (this.staminaRegenRate / 2) * deltaTime; // Slower regen while exhausted
                 if (this.stamina >= this.exhaustionThreshold) {
                     this.isExhausted = false; // Recover from exhaustion
                     if(this.eventLog) this.eventLog.addEntry("You feel recovered.");
                 }
             } else {
                 // Normal regeneration if not sprinting and not exhausted
                 this.stamina += this.staminaRegenRate * deltaTime;
             }
             this.stamina = Math.min(this.stamina, this.maxStamina); // Clamp stamina
        }
    }


    handleMovement(deltaTime) {
        const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
        _moveDirection.set(this.moveState.right, 0, this.moveState.forward); // Use Z for forward
        _moveDirection.normalize(); // Ensure consistent speed regardless of diagonal movement

        // --- Calculate world-space movement vector based on player orientation ---
        _forward.set(0, 0, 1).applyQuaternion(this.mesh.quaternion); // Player's forward
        _right.set(1, 0, 0).applyQuaternion(this.mesh.quaternion);   // Player's right

        _moveVelocity.set(0,0,0); // Reset velocity calculation vector
        _moveVelocity.addScaledVector(_forward, _moveDirection.z); // Apply forward/backward movement
        _moveVelocity.addScaledVector(_right, _moveDirection.x);   // Apply strafe movement

        // Apply speed
        _moveVelocity.normalize().multiplyScalar(currentSpeed);

        // Update actual velocity (only X and Z components)
        this.velocity.x = _moveVelocity.x;
        this.velocity.z = _moveVelocity.z;

        // Handle Jump - check if jump key was pressed *this frame*
        if (this.moveState.jump && this.canJump && this.stamina >= this.staminaJumpCost) {
             this.velocity.y = this.jumpForce;
             this.stamina -= this.staminaJumpCost;
             this.canJump = false; // Prevent double jump until grounded again
             this.isOnGround = false; // Player leaves the ground
             if(this.isExhausted && this.stamina <= 0) { // Check if jump made player exhausted
                 if(this.eventLog) this.eventLog.addEntry("You are exhausted!");
             }
        }
        // Note: this.moveState.jump is reset in the main update loop after processing
    }

    applyGravity(deltaTime) {
        // Apply gravity acceleration if not on ground
        if (!this.isOnGround) {
            this.velocity.y += this.gravity * deltaTime;
        }
        // Prevent accumulating downward velocity when grounded (unless jumping)
        // Velocity might be slightly negative due to ground check snapping, allow small tolerance
        if (this.isOnGround && this.velocity.y < 0) {
            this.velocity.y = 0;
        }
    }


    checkGround(collidables) {
     // Raycast origin slightly above the player's base (feet position)
     _groundCheckOrigin.copy(this.mesh.position);
     _groundCheckOrigin.y += 0.1; // Start ray just above the base

     // Cast ray down a short distance + allowed step height
     const rayLength = 0.2 + this.groundCheckDistance;

     const raycaster = new THREE.Raycaster(_groundCheckOrigin, _groundCheckDirection, 0, rayLength);

     const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj.userData.isCollidable);
     const intersects = raycaster.intersectObjects(checkAgainst, true); // Recursive check

     let foundGround = false;
     if (intersects.length > 0) {
         const groundY = intersects[0].point.y;
         const playerBaseY = this.mesh.position.y;

         // Check if the intersection point is within the acceptable distance below the player's base
         if (playerBaseY >= groundY && playerBaseY < groundY + this.groundCheckDistance) {
             foundGround = true;
             if (!this.isOnGround) { // Only snap/adjust velocity on first contact
                 this.mesh.position.y = groundY; // Snap player base exactly to ground
                 // Stop downward velocity only if landing or resting
                 if (this.velocity.y <= 0) {
                     this.velocity.y = 0;
                 }
                 // console.log(`Landed! Snapped to Y: ${groundY.toFixed(2)}`);
             }
             this.isOnGround = true;
             this.canJump = true; // Allow jumping only when grounded
         }
     }

    // If no ground detected within check distance, ensure flags are false
    if (!foundGround) {
        this.isOnGround = false;
        this.canJump = false;
    }
}

    handleFallDamage(fallSpeed) {
        const damageThreshold = 10.0; // Speed below which no damage occurs
        const damageFactor = 4.0;     // How much damage per unit speed above threshold

        if (fallSpeed > damageThreshold) {
            const damage = Math.round((fallSpeed - damageThreshold) * damageFactor);
            if(damage > 0) {
                if(this.eventLog) this.eventLog.addEntry(`Ouch! That hurt! (-${damage} HP)`);
                this.takeDamage(damage);
            }
        }
    }

    animateMovement(deltaTime) {
        // Simple arm/leg swing based on movement speed
        const speedRatio = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length() / (this.isSprinting ? this.runSpeed : this.walkSpeed);
        const bobFrequency = this.isSprinting ? 14 : 8; // Faster swing when running
        const bobAmplitude = 0.8; // Max swing angle in radians

        if (speedRatio > 0.1) { // Only animate when moving significantly
            const time = performance.now() * 0.001; // Use global time
            const phase = time * bobFrequency;

            // Oscillate arms and legs using sine wave
            const angle = Math.sin(phase) * bobAmplitude * speedRatio; // Scale swing by speed

            // Apply rotation relative to their origin (shoulder/hip)
            if (this.rightArm) this.rightArm.rotation.x = angle;
            if (this.leftArm) this.leftArm.rotation.x = -angle;
            if (this.rightLeg) this.rightLeg.rotation.x = -angle * 0.8; // Legs swing less than arms
            if (this.leftLeg) this.leftLeg.rotation.x = angle * 0.8;

        } else {
            // Return to resting position smoothly using lerp
             const restLerpFactor = 1.0 - Math.pow(0.01, deltaTime); // Adjust 0.01 for return speed
             if (this.rightArm) this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, restLerpFactor);
             if (this.leftArm) this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, restLerpFactor);
             if (this.rightLeg) this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, restLerpFactor);
             if (this.leftLeg) this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, restLerpFactor);
        }
    }

    // Override die for player specific logic
    die() {
        if(this.isDead) return;
        super.die(); // Sets isDead flag, stops velocity
        console.log("Player has died.");
        if(this.eventLog) this.eventLog.addEntry("You have died!");
        // The Game class update loop will detect isDead and trigger respawn
    }

     respawn(position) {
        this.setPosition(position);
        this.health = this.maxHealth * 0.75; // Respawn with 75% health
        this.stamina = this.maxStamina;
        this.velocity.set(0, 0, 0);
        this.isDead = false;
        this.isExhausted = false;
        this.isOnGround = false; // Force ground check on respawn
        this.canJump = false;
        this.lastVelocityY = 0;
        console.log("Player respawned.");
        if(this.eventLog) this.eventLog.addEntry("You feel slightly disoriented but alive.");
    }

    // Override updateBoundingBox for player specifically
    updateBoundingBox() {
        // Use a simplified capsule/box approximation for the player collision
        const center = this.mesh.position.clone();
        center.y += PLAYER_HEIGHT / 2; // Center the box vertically based on feet origin
        const size = new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_HEIGHT, PLAYER_RADIUS * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        // Ensure the userData reference is updated for the physics system
        this.mesh.userData.boundingBox = this.boundingBox;
    }
}