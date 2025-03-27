import * as THREE from 'three';
import { Entity } from './entity.js';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDirection = new THREE.Vector3();
const _moveVelocity = new THREE.Vector3();
// --- Ground Check Vectors ---
const _groundCheckOrigin = new THREE.Vector3();
const _groundCheckDirection = new THREE.Vector3(0, -1, 0);
const _groundRaycaster = new THREE.Raycaster(); // Use a dedicated raycaster instance

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
        // --- Ground Check Parameters ---
        this.groundCheckRayOffset = 0.1; // How far above player base ray starts
        this.groundCheckRayLength = 0.3; // How far down the ray checks (offset + length = total reach)
        this.groundSnapDistance = 0.25; // Max distance below player base to snap to ground
        // --- End Ground Check ---
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
        // Assuming player origin (this.mesh.position) is at feet level (y=0)
        bodyMesh.position.y = legLength + bodyHeight / 2; // Position body relative to origin
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true; // Player can receive shadows
        this.mesh.add(bodyMesh);

        // Head
        const headRadius = 0.3;
        const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = legLength + bodyHeight + headRadius; // Position head relative to origin
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        // Simple Limbs (Cylinders)
        const limbRadius = 0.15;
        const armLength = 0.8;
        const legLength = 0.9; // This determines the height of the body/head above origin

        // Left Arm
        const leftArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius*0.9, armLength, 8);
        this.leftArm = new THREE.Mesh(leftArmGeo, limbMat);
        this.leftArm.position.set(-0.5, legLength + bodyHeight - 0.2, 0.1); // Position relative to origin
        this.leftArm.geometry.translate(0, -armLength / 2, 0); // Set origin to shoulder
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        // Right Arm
        const rightArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius*0.9, armLength, 8);
        this.rightArm = new THREE.Mesh(rightArmGeo, limbMat);
        this.rightArm.position.set(0.5, legLength + bodyHeight - 0.2, 0.1); // Position relative to origin
        this.rightArm.geometry.translate(0, -armLength / 2, 0); // Set origin to shoulder
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // Left Leg
        const leftLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        this.leftLeg = new THREE.Mesh(leftLegGeo, limbMat);
        this.leftLeg.position.set(-0.2, 0, 0); // Position relative to origin (feet)
        this.leftLeg.geometry.translate(0, legLength / 2, 0); // Set origin to hip joint
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        // Right Leg
        const rightLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        this.rightLeg = new THREE.Mesh(rightLegGeo, limbMat);
        this.rightLeg.position.set(0.2, 0, 0); // Position relative to origin (feet)
        this.rightLeg.geometry.translate(0, legLength / 2, 0); // Set origin to hip joint
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);

         // Set player height reference for physics/camera
         // PLAYER_HEIGHT should represent the distance from feet (origin) to top of head
         this.mesh.userData.height = legLength + bodyHeight + headRadius * 2; // Calculate actual model height
         this.mesh.userData.radius = PLAYER_RADIUS;
    }

     // Overrides base Entity update
    update(deltaTime, moveState, collidables) {
         if (this.isDead) return;

         this.moveState = moveState; // Update movement intention from controls

         // Store state before updates for landing detection etc.
         const wasOnGround = this.isOnGround;
         this.lastVelocityY = this.velocity.y; // Store velocity BEFORE applying gravity


         // Apply physics and movement intention
         this.handleStamina(deltaTime);
         this.handleMovement(deltaTime); // Calculates horizontal velocity, handles jump impulse
         this.applyGravity(deltaTime); // Modifies vertical velocity

         // Apply calculated velocity to position
         this.mesh.position.x += this.velocity.x * deltaTime;
         this.mesh.position.y += this.velocity.y * deltaTime;
         this.mesh.position.z += this.velocity.z * deltaTime;

         // --- Ground Check and Correction ---
         // Perform ground check AFTER applying gravity and velocity
         this.checkGround(collidables);
         // --- End Ground Check ---

         // Detect landing after fall/jump AFTER ground check potentially sets isOnGround = true
         if (this.isOnGround && !wasOnGround && this.lastVelocityY < -1.0) {
             this.handleFallDamage(Math.abs(this.lastVelocityY));
         }

         // Collision response (push-out) is handled by the Physics system *after* this update.
         // The physics system might adjust the mesh position again.

         // Apply simple walking animation
         this.animateMovement(deltaTime);

         // Update bounding box *after* all position changes for this frame.
         // Physics system will use this updated box for its checks in the next step.
         this.updateBoundingBox();

         // Reset jump request only after checking it in handleMovement
         // Player.update() now consumes the jump flag internally via handleMovement
         // this.moveState.jump = false; // No longer needed here
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
        // Player mesh's quaternion already reflects rotation from controls.update
        _forward.set(0, 0, -1).applyQuaternion(this.mesh.quaternion); // Get forward vector (local -Z)
        _right.set(1, 0, 0).applyQuaternion(this.mesh.quaternion);   // Get right vector (local +X)

        _moveVelocity.set(0,0,0); // Reset velocity calculation vector
        // Add movement along forward vector (using Z component of moveDirection)
        _moveVelocity.addScaledVector(_forward, -_moveDirection.z); // Negate Z because local forward is -Z
        // Add movement along right vector (using X component of moveDirection)
        _moveVelocity.addScaledVector(_right, _moveDirection.x);

        // Apply speed only if there's movement input
        if (_moveDirection.lengthSq() > 0.001) {
             _moveVelocity.normalize().multiplyScalar(currentSpeed);
        }

        // Update actual velocity (only X and Z components)
        this.velocity.x = _moveVelocity.x;
        this.velocity.z = _moveVelocity.z;

        // Handle Jump - check if jump key was pressed *this frame*
        // Use the consumeJump method from Controls if available, otherwise check moveState
        // Assuming moveState.jump is set true for one frame by Controls on keydown
        if (this.moveState.jump && this.canJump && this.stamina >= this.staminaJumpCost) {
             this.velocity.y = this.jumpForce;
             this.stamina -= this.staminaJumpCost;
             this.canJump = false; // Prevent double jump until grounded again
             this.isOnGround = false; // Player leaves the ground
             console.log("Player Jumped!"); // Debug log
             if(this.isExhausted && this.stamina <= 0) { // Check if jump made player exhausted
                 if(this.eventLog) this.eventLog.addEntry("You are exhausted!");
             }
        }
        // Consume the jump flag *here* after checking it
        this.moveState.jump = false;
    }

    applyGravity(deltaTime) {
        // Apply gravity acceleration only if not firmly on ground
        // Let ground check handle snapping and zeroing velocity when landing
        if (!this.isOnGround) {
            this.velocity.y += this.gravity * deltaTime;
            // Clamp maximum fall speed (optional)
            this.velocity.y = Math.max(this.velocity.y, -50.0); // Terminal velocity limit
        }
    }

    // --- Updated Ground Check ---
    checkGround(collidables) {
         // 1. Define Ray Origin: Start slightly above the player's base (mesh.position)
         _groundCheckOrigin.copy(this.mesh.position);
         _groundCheckOrigin.y += this.groundCheckRayOffset;

         // 2. Set Raycaster parameters
         _groundRaycaster.set(_groundCheckOrigin, _groundCheckDirection);
         _groundRaycaster.near = 0;
         _groundRaycaster.far = this.groundCheckRayLength; // Check down offset+length distance

         // 3. Filter collidables (exclude self, include terrain and other collidable objects)
         const checkAgainst = collidables.filter(obj => obj && obj !== this.mesh && obj.userData?.isCollidable);
         if (checkAgainst.length === 0) {
             // If nothing to collide with (e.g., only player in list), assume not grounded
             this.isOnGround = false;
             this.canJump = false;
             return;
         }

         // 4. Perform Raycast
         const intersects = _groundRaycaster.intersectObjects(checkAgainst, true); // Recursive check is usually needed for complex scenes

         let foundGround = false;
         if (intersects.length > 0) {
             // Find the closest intersection point
             const closestHit = intersects[0];
             const groundY = closestHit.point.y;
             const playerBaseY = this.mesh.position.y;

             // 5. Check if the ground is close enough below the player's base
             // The hit must be below the ray origin and within the snap distance of the base.
             if (groundY < _groundCheckOrigin.y && playerBaseY >= groundY - 0.01 && playerBaseY <= groundY + this.groundSnapDistance) {
                // Ground detected within snapping distance!
                foundGround = true;

                 // Snap position only if significantly penetrating or slightly above
                 // This prevents micro-adjustments when already standing still
                 if (playerBaseY < groundY || playerBaseY > groundY + 0.01) {
                    this.mesh.position.y = groundY;
                     // console.log(`Snapped to ground at Y: ${groundY.toFixed(2)}`); // Debug log
                 }

                 // Only set grounded state and zero velocity if actually landing or resting
                 if (!this.isOnGround || this.velocity.y <= 0) {
                     this.isOnGround = true;
                     this.canJump = true;
                     // Crucial: Reset vertical velocity only when landing/resting
                     if (this.velocity.y < 0) {
                         this.velocity.y = 0;
                     }
                 }
             }
         }

        // If no suitable ground was found within the ray length and snap distance
        if (!foundGround) {
            this.isOnGround = false;
            this.canJump = false;
        }
    }
    // --- End Updated Ground Check ---

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
        const speed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
        const currentMaxSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
        const speedRatio = currentMaxSpeed > 0 ? speed / currentMaxSpeed : 0;

        const bobFrequency = this.isSprinting ? 14 : 8; // Faster swing when running
        const bobAmplitude = 0.8; // Max swing angle in radians

        if (speedRatio > 0.1 && this.rightArm && this.leftArm && this.rightLeg && this.leftLeg) { // Check if limbs exist
            const time = performance.now() * 0.001; // Use global time
            const phase = time * bobFrequency;

            // Oscillate arms and legs using sine wave
            const angle = Math.sin(phase) * bobAmplitude * speedRatio; // Scale swing by speed

            // Apply rotation relative to their origin (shoulder/hip)
            this.rightArm.rotation.x = angle;
            this.leftArm.rotation.x = -angle;
            this.rightLeg.rotation.x = -angle * 0.8; // Legs swing less than arms
            this.leftLeg.rotation.x = angle * 0.8;

        } else if (this.rightArm && this.leftArm && this.rightLeg && this.leftLeg) { // Check if limbs exist
            // Return to resting position smoothly using lerp
             const restLerpFactor = 1.0 - Math.pow(0.01, deltaTime); // Adjust 0.01 for return speed
             this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, restLerpFactor);
             this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, restLerpFactor);
             this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, restLerpFactor);
             this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, restLerpFactor);
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
        // Ensure bounding box is correct at respawn location
        this.updateBoundingBox();
    }

    // Override updateBoundingBox for player specifically
    updateBoundingBox() {
        // Ensure mesh exists before accessing properties
        if (!this.mesh) return;
        // Use a simplified capsule/box approximation for the player collision
        const center = this.mesh.position.clone();
        // Calculate center Y based on actual model height stored in userData or default PLAYER_HEIGHT
        const height = this.mesh.userData.height || PLAYER_HEIGHT;
        center.y += height / 2; // Center the box vertically assuming origin is at feet
        const size = new THREE.Vector3(PLAYER_RADIUS * 2, height, PLAYER_RADIUS * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        // Ensure the userData reference is updated for the physics system
        this.mesh.userData.boundingBox = this.boundingBox;
    }
}