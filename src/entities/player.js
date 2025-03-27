///player.js

import * as THREE from 'three';
import { Entity } from './entity.js';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const _forward = new THREE.Vector3(); // Player's local forward vector in world space
const _right = new THREE.Vector3();   // Player's local right vector in world space
const _moveDirection = new THREE.Vector3(); // Input direction (from WASD) relative to player
const _moveVelocity = new THREE.Vector3(); // Calculated world-space velocity vector for the frame
const _groundCheckOrigin = new THREE.Vector3();
const _groundCheckDirection = new THREE.Vector3(0, -1, 0);


export class Player extends Entity {
    constructor(scene, position) {
        super(scene, position, 'Player');

        this.userData.isPlayer = true;
        this.userData.isCollidable = true;
        this.userData.isInteractable = false;

        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.maxStamina = 100;
        this.stamina = this.maxStamina;
        this.walkSpeed = 4.0;
        this.runSpeed = 8.0;
        this.jumpForce = 8.0;
        this.staminaDrainRate = 15;
        this.staminaRegenRate = 10;
        this.staminaJumpCost = 10;
        this.canJump = false;
        this.isSprinting = false;
        this.isExhausted = false;
        this.exhaustionThreshold = 20;

        // Movement state (updated by Controls system)
        this.moveState = {
            forward: 0, // -1 (S), 0, 1 (W)
            right: 0,   // -1 (A), 0, 1 (D)
            jump: false,
            sprint: false,
        };

        // Physics related
        this.gravity = -25;
        this.isOnGround = false;
        this.groundCheckDistance = 0.15;
        this.lastVelocityY = 0;

        // Player Model (Simple Blocky Humanoid)
        this.createModel();
        this.updateBoundingBox();

        // References
        this.questLog = null;
        this.eventLog = null;
    }

    setJournal(questLog, eventLog) {
        this.questLog = questLog;
        this.eventLog = eventLog;
    }


    createModel() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x0077ff });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 });
        const limbMat = bodyMat;

        const limbRadius = 0.15;
        const armLength = 0.8;
        const legLength = 0.9;

        const bodyHeight = 1.0;
        const bodyGeo = new THREE.BoxGeometry(0.8, bodyHeight, 0.5);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = legLength / 2 + bodyHeight / 2;
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        const headRadius = 0.3;
        const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = bodyMesh.position.y + bodyHeight / 2 + headRadius;
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        const leftArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius*0.9, armLength, 8);
        this.leftArm = new THREE.Mesh(leftArmGeo, limbMat);
        this.leftArm.position.set(-0.5, bodyMesh.position.y + 0.2, 0.1);
        leftArmGeo.translate(0, -armLength / 2, 0);
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        const rightArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius*0.9, armLength, 8);
        this.rightArm = new THREE.Mesh(rightArmGeo, limbMat);
        this.rightArm.position.set(0.5, bodyMesh.position.y + 0.2, 0.1);
        rightArmGeo.translate(0, -armLength / 2, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        const leftLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        this.leftLeg = new THREE.Mesh(leftLegGeo, limbMat);
        this.leftLeg.position.set(-0.2, bodyMesh.position.y - bodyHeight/2, 0);
        leftLegGeo.translate(0, -legLength / 2, 0);
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        const rightLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        this.rightLeg = new THREE.Mesh(rightLegGeo, limbMat);
        this.rightLeg.position.set(0.2, bodyMesh.position.y - bodyHeight/2, 0);
        rightLegGeo.translate(0, -legLength / 2, 0);
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);

        this.mesh.userData.height = PLAYER_HEIGHT;
        this.mesh.userData.radius = PLAYER_RADIUS;
    }

     // Overrides base Entity update
    update(deltaTime, moveState, collidables) {
         if (this.isDead) return;

         this.moveState = moveState; // Update movement intention from controls

         const previousY = this.mesh.position.y;
         const wasOnGround = this.isOnGround;

         this.handleStamina(deltaTime);
         // Calculates desired world-space velocity based on input and player rotation
         this.handleMovement(deltaTime);

         // --- Physics Update Order ---
         this.applyGravity(deltaTime);
         this.mesh.position.x += this.velocity.x * deltaTime;
         this.mesh.position.z += this.velocity.z * deltaTime;
         // Ground check AFTER XZ movement, BEFORE Y movement
         this.checkGround(collidables);
         this.mesh.position.y += this.velocity.y * deltaTime;
         // --- End Physics Update Order ---

         if (this.isOnGround && !wasOnGround && this.lastVelocityY < -1.0) {
             this.handleFallDamage(Math.abs(this.lastVelocityY));
         }
         this.lastVelocityY = this.velocity.y;

         this.animateMovement(deltaTime);
         this.updateBoundingBox();

         this.moveState.jump = false; // Consume jump state here after player update logic
    }


    handleStamina(deltaTime) {
        const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
        this.isSprinting = this.moveState.sprint && isMoving && !this.isExhausted && this.stamina > 0;

        if (this.isSprinting) {
            this.stamina -= this.staminaDrainRate * deltaTime;
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.isExhausted = true;
                this.isSprinting = false;
                 if(this.eventLog) this.eventLog.addEntry("You are exhausted!");
            }
        } else {
             if(this.isExhausted) {
                 this.stamina += (this.staminaRegenRate / 2) * deltaTime;
                 if (this.stamina >= this.exhaustionThreshold) {
                     this.isExhausted = false;
                     if(this.eventLog) this.eventLog.addEntry("You feel recovered.");
                 }
             } else {
                 this.stamina += this.staminaRegenRate * deltaTime;
             }
             this.stamina = Math.min(this.stamina, this.maxStamina);
        }
    }


    /**
     * Calculates the world-space velocity vector based on player input (moveState)
     * and the player mesh's current rotation (controlled by mouse yaw in Controls).
     */
    handleMovement(deltaTime) {
        const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;

        // Get player's current world-space orientation vectors
        // Forward vector (local -Z axis rotated into world space)
        // ** FIX: Use (0, 0, -1) for forward, assuming model's front faces -Z **
        _forward.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        // Right vector (local X axis rotated into world space)
        _right.set(1, 0, 0).applyQuaternion(this.mesh.quaternion);

        // Get input direction relative to player (W=1, S=-1 -> Z) (D=1, A=-1 -> X)
        _moveDirection.set(this.moveState.right, 0, this.moveState.forward);
        // Normalize _moveDirection to prevent faster diagonal movement
        _moveDirection.normalize();

        // Calculate world-space movement velocity
        _moveVelocity.set(0,0,0); // Reset calculation vector

        // Add movement along player's forward/backward axis
        // _moveDirection.z is 1 for W, -1 for S. _forward now points visually forward.
        _moveVelocity.addScaledVector(_forward, _moveDirection.z);

        // Add movement along player's right/left axis
        // _moveDirection.x is 1 for D, -1 for A
        _moveVelocity.addScaledVector(_right, _moveDirection.x);

        // Apply speed if there was any input
        // Normalize the final velocity vector before scaling by speed
        if (_moveDirection.lengthSq() > 0) { // Check if there was input (W/A/S/D)
            _moveVelocity.normalize().multiplyScalar(currentSpeed);
        } else {
            _moveVelocity.set(0,0,0); // Ensure velocity is zero if no input
        }

        // Update the entity's actual velocity X and Z components
        this.velocity.x = _moveVelocity.x;
        this.velocity.z = _moveVelocity.z;

        // Handle Jump
        if (this.moveState.jump && this.canJump && this.stamina >= this.staminaJumpCost) {
             this.velocity.y = this.jumpForce;
             this.stamina -= this.staminaJumpCost;
             this.canJump = false;
             this.isOnGround = false;
             if(this.isExhausted && this.stamina <= 0) {
                 if(this.eventLog) this.eventLog.addEntry("You are exhausted!");
             }
        }
        // Note: this.moveState.jump is reset at the end of the main update loop
    }

    applyGravity(deltaTime) {
        if (!this.isOnGround || this.velocity.y > 0) {
            this.velocity.y += this.gravity * deltaTime;
        }
    }

    checkGround(collidables) {
        _groundCheckOrigin.copy(this.mesh.position);
        _groundCheckOrigin.y += 0.1; // Start ray slightly above player base
        const rayLength = 0.1 + this.groundCheckDistance; // Adjusted to match origin offset
        const raycaster = new THREE.Raycaster(_groundCheckOrigin, _groundCheckDirection, 0, rayLength);
        const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj.userData.isCollidable);
        const intersects = raycaster.intersectObjects(checkAgainst, true);

        let foundGround = false;
        let groundY = -Infinity;
        if (intersects.length > 0) {
            // Find the highest intersection point that's meaningfully below the ray origin
            for (const intersect of intersects) {
                // Check distance to avoid floating point issues with ground directly under origin
                if (intersect.distance > 0.01) {
                    groundY = Math.max(groundY, intersect.point.y);
                    foundGround = true;
                }
            }
        }

        if (foundGround) {
            const playerBaseY = this.mesh.position.y;
            // Snap to ground if player is very close to or slightly below the detected ground level
            // and falling or standing still vertically.
            if (playerBaseY <= groundY + this.groundCheckDistance && this.velocity.y <= 0) {
                this.mesh.position.y = groundY;
                this.velocity.y = 0;
                this.isOnGround = true;
                this.canJump = true;
            } else {
                // Player is above ground (e.g., jumping up, falling but still high)
                this.isOnGround = false;
                this.canJump = false;
            }
        } else {
            // No ground detected within range
            this.isOnGround = false;
            this.canJump = false;
        }
    }


    handleFallDamage(fallSpeed) {
        const damageThreshold = 10.0;
        const damageFactor = 4.0;
        if (fallSpeed > damageThreshold) {
            const damage = Math.round((fallSpeed - damageThreshold) * damageFactor);
            if(damage > 0) {
                if(this.eventLog) this.eventLog.addEntry(`Ouch! That hurt! (-${damage} HP)`);
                this.takeDamage(damage);
            }
        }
    }

    animateMovement(deltaTime) {
        const speedRatio = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length() / (this.isSprinting ? this.runSpeed : this.walkSpeed);
        const bobFrequency = this.isSprinting ? 14 : 8;
        const bobAmplitude = 0.8;

        if (speedRatio > 0.1 && this.isOnGround) { // Only animate legs/arms when moving on ground
            const time = performance.now() * 0.001;
            const phase = time * bobFrequency;
            const angle = Math.sin(phase) * bobAmplitude * speedRatio;
            if (this.rightArm) this.rightArm.rotation.x = angle;
            if (this.leftArm) this.leftArm.rotation.x = -angle;
            if (this.rightLeg) this.rightLeg.rotation.x = -angle * 0.8;
            if (this.leftLeg) this.leftLeg.rotation.x = angle * 0.8;
        } else {
             const restLerpFactor = 1.0 - Math.pow(0.01, deltaTime); // Smooth return to rest
             if (this.rightArm) this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, restLerpFactor);
             if (this.leftArm) this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, restLerpFactor);
             if (this.rightLeg) this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, restLerpFactor);
             if (this.leftLeg) this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, restLerpFactor);
        }
    }

    die() {
        if(this.isDead) return;
        super.die();
        console.log("Player has died.");
        if(this.eventLog) this.eventLog.addEntry("You have died!");
        // Consider adding logic to disable controls or trigger respawn sequence
    }

     respawn(position) {
        this.setPosition(position);
        this.health = this.maxHealth * 0.75;
        this.stamina = this.maxStamina;
        this.velocity.set(0, 0, 0);
        this.isDead = false;
        this.isExhausted = false;
        this.isOnGround = false; // Reset ground state
        this.canJump = false;    // Reset jump state
        this.lastVelocityY = 0;
        console.log("Player respawned.");
        if(this.eventLog) this.eventLog.addEntry("You feel slightly disoriented but alive.");
        this.updateBoundingBox(); // Ensure bounding box is correct at new position
    }

    updateBoundingBox() {
        // Center the bounding box based on the mesh position and defined height/radius
        const center = this.mesh.position.clone();
        center.y += PLAYER_HEIGHT / 2; // Assuming mesh position is at the base
        const size = new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_HEIGHT, PLAYER_RADIUS * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        this.mesh.userData.boundingBox = this.boundingBox; // Keep reference accessible if needed elsewhere
    }
}