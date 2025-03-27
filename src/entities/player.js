import * as THREE from 'three';
import { Entity } from './entity.js';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDirection = new THREE.Vector3();
const _moveVector = new THREE.Vector3();

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

        // Movement state (updated by Controls system)
        this.moveState = {
            forward: 0, // -1, 0, 1
            right: 0,   // -1, 0, 1
            jump: false,
            sprint: false,
        };

        // Physics related
        this.gravity = -25; // Acceleration due to gravity
        this.isOnGround = false;
        this.groundCheckDistance = 0.1; // How far below the player to check for ground

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
        const bodyGeo = new THREE.BoxGeometry(0.8, 1.0, 0.5);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.7; // Position body relative to player origin (feet)
        bodyMesh.castShadow = true;
        this.mesh.add(bodyMesh);

        // Head
        const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = bodyMesh.position.y + 0.5 + 0.3; // Place on top of body
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        // Simple Limbs (Cylinders) - could be animated later
        const limbRadius = 0.15;
        const armLength = 0.8;
        const legLength = 0.9;

        // Left Arm
        const leftArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius, armLength, 8);
        this.leftArm = new THREE.Mesh(leftArmGeo, limbMat);
        this.leftArm.position.set(-0.5, bodyMesh.position.y + 0.3, 0);
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        // Right Arm
        const rightArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius, armLength, 8);
        this.rightArm = new THREE.Mesh(rightArmGeo, limbMat);
        this.rightArm.position.set(0.5, bodyMesh.position.y + 0.3, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // Left Leg
        const leftLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        this.leftLeg = new THREE.Mesh(leftLegGeo, limbMat);
        this.leftLeg.position.set(-0.2, legLength / 2, 0);
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        // Right Leg
        const rightLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        this.rightLeg = new THREE.Mesh(rightLegGeo, limbMat);
        this.rightLeg.position.set(0.2, legLength / 2, 0);
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);

         // Set player height reference for physics/camera
         this.mesh.userData.height = PLAYER_HEIGHT;
         this.mesh.userData.radius = PLAYER_RADIUS;
    }

     // Overrides base Entity update
    update(deltaTime, moveState, collidables) {
         if (this.isDead) return;

         this.moveState = moveState; // Update movement intention from controls

         this.handleStamina(deltaTime);
         this.handleMovement(deltaTime);
         this.applyGravity(deltaTime);
         this.checkGround(collidables); // Check if player is on the ground

         // Apply simple walking animation
        this.animateMovement(deltaTime);

         // Update bounding box after potential movement/gravity
         this.updateBoundingBox();

         // Note: Collision *response* (pushing player out of obstacles)
         // is typically handled in the Physics system *after* player update.
    }
    

    handleStamina(deltaTime) {
        const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
        this.isSprinting = this.moveState.sprint && isMoving && !this.isExhausted && this.stamina > 0;

        if (this.isSprinting) {
            this.stamina -= this.staminaDrainRate * deltaTime;
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.isExhausted = true; // Become exhausted
                this.isSprinting = false; // Stop sprinting
                 if(this.eventLog) this.eventLog.addEntry("You feel exhausted.");
            }
        } else {
            // Regenerate stamina if not sprinting and not exhausted, or once exhaustion wears off
            if (!this.isExhausted || this.stamina > 20) { // Require some regen before exhaustion ends
                 this.isExhausted = false; // Recover from exhaustion
                 this.stamina += this.staminaRegenRate * deltaTime;
                 this.stamina = Math.min(this.stamina, this.maxStamina);
            } else if (this.isExhausted) {
                 // Still exhausted, regenerate slowly until threshold
                 this.stamina += (this.staminaRegenRate / 2) * deltaTime; // Slower regen while exhausted
            }
        }
    }


    handleMovement(deltaTime) {
    const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
    // const moveDirection = new THREE.Vector3(); // OLD
    _moveDirection.set(0,0,0); // Reset reusable vector

    // Calculate forward/backward movement
    _moveDirection.z = this.moveState.forward;
    // Calculate left/right strafing movement
    _moveDirection.x = this.moveState.right;

    _moveDirection.normalize();
    _moveDirection.multiplyScalar(currentSpeed * deltaTime);

    // --- Apply movement relative to player's orientation ---
    // const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion); // OLD
    // const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion); // OLD
    _forward.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    _right.set(1, 0, 0).applyQuaternion(this.mesh.quaternion);


    // const moveVector = new THREE.Vector3(); // OLD
    _moveVector.set(0,0,0); // Reset reusable vector
    _moveVector.addScaledVector(_forward, _moveDirection.z);
    _moveVector.addScaledVector(_right, _moveDirection.x);

    this.velocity.x = _moveVector.x / deltaTime;
    this.velocity.z = _moveVector.z / deltaTime;


        // Handle Jump
        if (this.moveState.jump && this.canJump && this.stamina >= this.staminaJumpCost) {
             this.velocity.y = this.jumpForce;
             this.stamina -= this.staminaJumpCost;
             this.canJump = false; // Prevent double jump until grounded again
             this.isOnGround = false;
        }
        // Reset jump request
        this.moveState.jump = false; // Consume the jump input
    }

    applyGravity(deltaTime) {
        // Apply gravity acceleration if not on ground or moving upwards from jump
        if (!this.isOnGround) {
            this.velocity.y += this.gravity * deltaTime;
        } else {
            // If on ground, ensure vertical velocity is not accumulating downwards
            // A small negative velocity helps stick to slopes, but 0 is simpler for now
             this.velocity.y = Math.max(0, this.velocity.y); // Prevent bouncing, but allow jump velocity
        }
    }


        checkGround(collidables) {
     const origin = this.mesh.position.clone();
     // Start ray slightly inside the player's vertical center and cast down longer distance
     origin.y += this.mesh.userData.height * 0.5; // Start ray near center mass
     const direction = new THREE.Vector3(0, -1, 0);
     // Cast ray longer than just the player height to ensure it hits ground even on slopes/steps
     const rayLength = this.mesh.userData.height * 0.6; // Check slightly more than half height down

     const raycaster = new THREE.Raycaster(origin, direction, 0, rayLength);

     const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj.userData.isCollidable);
     const intersects = raycaster.intersectObjects(checkAgainst, true);

     const prevOnGround = this.isOnGround;
     this.isOnGround = false; // Assume not on ground until proven otherwise

     if (intersects.length > 0) {
         const groundY = intersects[0].point.y;
         const playerBaseY = this.mesh.position.y; // Player origin is at feet

         // If the ground is very close below the player's base, consider it grounded
         if (playerBaseY >= groundY && playerBaseY < groundY + this.groundCheckDistance) {
             this.isOnGround = true;
             this.canJump = true; // Allow jumping only when grounded

             // Snap player base exactly to ground
             this.mesh.position.y = groundY;

             // Stop downward velocity only if landing or resting
              if (this.velocity.y <= 0) {
                 this.velocity.y = 0;
              }

             // Debug log
             // console.log(`Grounded! Snapped to Y: ${groundY.toFixed(2)}`);
         }
     }

    // If no ground detected within check distance, ensure flags are false
    if (!this.isOnGround) {
        this.canJump = false;
    }


     // Detect landing after a fall/jump
     if (this.isOnGround && !prevOnGround && this.velocity.y < -1.0) {
         const fallSpeed = Math.abs(this.velocity.y);
         // console.log(`Landed with speed: ${fallSpeed.toFixed(2)}`); // Debug log
         this.handleFallDamage(fallSpeed);
         // this.velocity.y = 0; // Already set to 0 or positive during snap/ground check
     }
}

    handleFallDamage(fallSpeed) {
        const damageThreshold = 10.0; // Speed below which no damage occurs
        const damageFactor = 5.0;     // How much damage per unit speed above threshold

        if (fallSpeed > damageThreshold) {
            const damage = Math.round((fallSpeed - damageThreshold) * damageFactor);
             if(this.eventLog) this.eventLog.addEntry(`You fell from a height! (-${damage} HP)`);
            this.takeDamage(damage);
        }
    }

    animateMovement(deltaTime) {
        // Simple arm/leg swing based on movement speed
        const speed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
        const bobFrequency = this.isSprinting ? 14 : 8; // Faster swing when running
        const bobAmplitude = 0.8;

        if (speed > 0.1) { // Only animate when moving significantly
            const time = performance.now() * 0.001; // Use global time
            const phase = time * bobFrequency;

            // Oscillate arms and legs using sine wave
            const angle = Math.sin(phase) * bobAmplitude * (speed / (this.isSprinting ? this.runSpeed : this.walkSpeed));

            if (this.rightArm) this.rightArm.rotation.x = angle;
            if (this.leftArm) this.leftArm.rotation.x = -angle;
            if (this.rightLeg) this.rightLeg.rotation.x = -angle * 0.8; // Legs swing less than arms
            if (this.leftLeg) this.leftLeg.rotation.x = angle * 0.8;

        } else {
            // Return to resting position smoothly (optional - lerp towards 0)
             const restLerp = deltaTime * 5;
             if (this.rightArm) this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, restLerp);
             if (this.leftArm) this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, restLerp);
             if (this.rightLeg) this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, restLerp);
             if (this.leftLeg) this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, restLerp);
        }
    }

    // Override die for player specific logic
    die() {
        if(this.isDead) return;
        super.die();
        console.log("Player has died.");
        // The Game class update loop will detect isDead and trigger respawn
    }

     respawn(position) {
        this.setPosition(position);
        this.health = this.maxHealth * 0.75; // Respawn with 75% health
        this.stamina = this.maxStamina;
        this.velocity.set(0, 0, 0);
        this.isDead = false;
        this.isExhausted = false;
        console.log("Player respawned.");
    }

    // Override updateBoundingBox for player specifically
    updateBoundingBox() {
        // Use a simplified capsule/box approximation for the player collision
        const center = this.mesh.position.clone();
        center.y += PLAYER_HEIGHT / 2; // Center the box vertically
        const size = new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_HEIGHT, PLAYER_RADIUS * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        this.mesh.userData.boundingBox = this.boundingBox; // Ensure userData reference is updated
    }
}