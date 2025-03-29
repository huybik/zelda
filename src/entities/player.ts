import * as THREE from 'three';
import { Entity } from './entity';
import { QuestLog, EventLog } from '../systems/quest';
import { MoveState } from '../types/common';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDirection = new THREE.Vector3();
const _moveVelocity = new THREE.Vector3();
const _groundCheckOrigin = new THREE.Vector3();
const _groundCheckDirection = new THREE.Vector3(0, -1, 0);

export class Player extends Entity {
    // Stats
    public maxStamina: number;
    public stamina: number;
    public walkSpeed: number;
    public runSpeed: number;
    public jumpForce: number;
    public staminaDrainRate: number;
    public staminaRegenRate: number;
    public staminaJumpCost: number;

    // State
    public canJump: boolean;
    public isSprinting: boolean;
    public isExhausted: boolean;
    public exhaustionThreshold: number;
    public moveState: MoveState; // Updated by Controls system

    // Physics
    private gravity: number;
    public isOnGround: boolean;
    private groundCheckDistance: number;
    private lastVelocityY: number; // For fall damage calculation

    // Model Parts (optional, for animation)
    private headMesh?: THREE.Mesh;
    private leftArm?: THREE.Mesh;
    private rightArm?: THREE.Mesh;
    private leftLeg?: THREE.Mesh;
    private rightLeg?: THREE.Mesh;

    // System References
    public questLog: QuestLog | null = null;
    public eventLog: EventLog | null = null;

    constructor(scene: THREE.Scene, position: THREE.Vector3) {
        super(scene, position, 'Player');

        this.userData.isPlayer = true;
        this.userData.isCollidable = true;
        this.userData.isInteractable = false; // Player isn't interacted with via 'E'

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
        this.exhaustionThreshold = 20; // Stamina level below which exhaustion recovers

        this.moveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false };

        this.gravity = -25;
        this.isOnGround = false;
        this.groundCheckDistance = 0.15; // How far below feet to check
        this.lastVelocityY = 0;

        this.createModel();
        this.updateBoundingBox(); // Calculate initial box
    }

    public setJournal(questLog: QuestLog, eventLog: EventLog): void {
        this.questLog = questLog;
        this.eventLog = eventLog;
    }

    private createModel(): void {
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x0077ff });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 });
        const limbMat = bodyMat;

        const limbRadius = 0.15;
        const armLength = 0.8;
        const legLength = 0.9;
        const bodyHeight = 1.0;
        const headRadiusVal = 0.3; // Renamed to avoid conflict with THREE.HeadRadius

        // Body
        const bodyGeo = new THREE.BoxGeometry(0.8, bodyHeight, 0.5);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        // Position body so its base aligns with top of legs
        bodyMesh.position.y = legLength + bodyHeight / 2;
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        // Head
        const headGeo = new THREE.SphereGeometry(headRadiusVal, 16, 16);
        this.headMesh = new THREE.Mesh(headGeo, headMat);
        this.headMesh.position.y = bodyMesh.position.y + bodyHeight / 2 + headRadiusVal;
        this.headMesh.castShadow = true;
        this.mesh.add(this.headMesh);

        // Arms (origin at shoulder)
        const armOffsetY = bodyMesh.position.y + bodyHeight * 0.4; // Shoulder height
        const armOffsetX = 0.5;
        const leftArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 0.9, armLength, 8);
        leftArmGeo.translate(0, -armLength / 2, 0); // Translate geometry pivot to top
        this.leftArm = new THREE.Mesh(leftArmGeo, limbMat);
        this.leftArm.position.set(-armOffsetX, armOffsetY, 0);
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        const rightArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 0.9, armLength, 8);
        rightArmGeo.translate(0, -armLength / 2, 0);
        this.rightArm = new THREE.Mesh(rightArmGeo, limbMat);
        this.rightArm.position.set(armOffsetX, armOffsetY, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // Legs (origin at hip)
        const legOffsetY = bodyMesh.position.y - bodyHeight / 2; // Hip height
        const legOffsetX = 0.2;
        const leftLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        leftLegGeo.translate(0, -legLength / 2, 0); // Translate geometry pivot to top
        this.leftLeg = new THREE.Mesh(leftLegGeo, limbMat);
        this.leftLeg.position.set(-legOffsetX, legOffsetY, 0);
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        const rightLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        rightLegGeo.translate(0, -legLength / 2, 0);
        this.rightLeg = new THREE.Mesh(rightLegGeo, limbMat);
        this.rightLeg.position.set(legOffsetX, legOffsetY, 0);
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);

        // Store dimensions used for bounding box
        this.userData.height = PLAYER_HEIGHT;
        this.userData.radius = PLAYER_RADIUS;
    }

    override update(deltaTime: number, moveState: MoveState, collidables: THREE.Object3D[]): void {
        if (this.isDead) return;

        this.moveState = moveState; // Update movement intention

        const wasOnGround = this.isOnGround;

        this.handleStamina(deltaTime);
        this.handleMovement(deltaTime);

        // --- Physics Update ---
        this.applyGravity(deltaTime);
        // Apply XZ velocity
        this.mesh.position.x += this.velocity.x * deltaTime;
        this.mesh.position.z += this.velocity.z * deltaTime;
        // Check ground BEFORE applying Y velocity
        this.checkGround(collidables);
        // Apply Y velocity
        this.mesh.position.y += this.velocity.y * deltaTime;
        // --- End Physics ---

        // Fall Damage Check
        if (this.isOnGround && !wasOnGround && this.lastVelocityY < -1.0) {
            this.handleFallDamage(Math.abs(this.lastVelocityY));
        }
        this.lastVelocityY = this.velocity.y;

        this.animateMovement(deltaTime);
        this.updateBoundingBox();

        // Consumed by Player logic, reset for Controls (though Controls resets its own)
        // this.moveState.jump = false;
    }

    private handleStamina(deltaTime: number): void {
        const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
        this.isSprinting = this.moveState.sprint && isMoving && !this.isExhausted && this.stamina > 0;

        if (this.isSprinting) {
            this.stamina -= this.staminaDrainRate * deltaTime;
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.isExhausted = true;
                this.isSprinting = false;
                this.eventLog?.addEntry("You are exhausted!");
            }
        } else {
            let regenRate = this.staminaRegenRate;
            if (this.isExhausted) {
                regenRate /= 2; // Slower regen when exhausted
                if (this.stamina >= this.exhaustionThreshold) {
                    this.isExhausted = false;
                    this.eventLog?.addEntry("You feel recovered.");
                }
            }
            this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * deltaTime);
        }
    }

    private handleMovement(deltaTime: number): void {
        const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;

        // Get player's world orientation vectors based on mesh rotation
        _forward.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        _right.set(1, 0, 0).applyQuaternion(this.mesh.quaternion);

        // Calculate input direction relative to player
        _moveDirection.set(this.moveState.right, 0, this.moveState.forward).normalize();

        // Calculate world-space movement velocity vector
        _moveVelocity.set(0, 0, 0)
            .addScaledVector(_forward, _moveDirection.z)
            .addScaledVector(_right, _moveDirection.x);

        // Apply speed only if there's movement input
        if (_moveDirection.lengthSq() > 0) {
            _moveVelocity.normalize().multiplyScalar(currentSpeed);
        }

        // Update actual velocity X and Z components
        this.velocity.x = _moveVelocity.x;
        this.velocity.z = _moveVelocity.z;

        // Handle Jump
        if (this.moveState.jump && this.canJump && this.stamina >= this.staminaJumpCost) {
            this.velocity.y = this.jumpForce;
            this.stamina -= this.staminaJumpCost;
            this.canJump = false;
            this.isOnGround = false; // Ensure player leaves ground immediately
            // Check exhaustion *after* spending stamina
            if (this.stamina <= 0 && !this.isExhausted) {
                this.isExhausted = true;
                 this.eventLog?.addEntry("You are exhausted!");
            }
        }
    }

    private applyGravity(deltaTime: number): void {
        // Apply gravity if airborne or moving upwards
        if (!this.isOnGround || this.velocity.y > 0) {
            this.velocity.y += this.gravity * deltaTime;
        } else {
            // Ensure downward velocity is clamped when on ground (prevents bouncing)
            // but allow slight negative velocity to keep ground check active
            this.velocity.y = Math.max(this.gravity * deltaTime, -0.1); // Small negative keeps pushing down
        }
    }

    private checkGround(collidables: THREE.Object3D[]): void {
        _groundCheckOrigin.copy(this.mesh.position);
        _groundCheckOrigin.y += 0.1; // Raycast origin slightly above player base
        const rayLength = 0.1 + this.groundCheckDistance; // Total distance downwards to check

        const raycaster = new THREE.Raycaster(_groundCheckOrigin, _groundCheckDirection, 0, rayLength);
        // Filter out non-collidables and self
        const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj?.userData?.isCollidable);
        const intersects = raycaster.intersectObjects(checkAgainst, true); // Recursive check

        let foundGround = false;
        let groundY = -Infinity;

        if (intersects.length > 0) {
            // Find the highest valid intersection point slightly below the ray origin
            for (const intersect of intersects) {
                if (intersect.distance > 0.01) { // Ignore self/surface intersections
                    groundY = Math.max(groundY, intersect.point.y);
                    foundGround = true;
                    // Break early if we found a sufficiently close ground point? Maybe not needed.
                }
            }
        }

        const playerBaseY = this.mesh.position.y;
        const snapThreshold = 0.05; // Very small threshold for snapping

        if (foundGround && playerBaseY <= groundY + this.groundCheckDistance + snapThreshold) {
             // If player is close enough to the detected ground and falling/still
            if (!this.isOnGround && this.velocity.y <= 0) {
                 // Landing sequence
                 this.mesh.position.y = groundY; // Snap to ground
                 this.velocity.y = 0; // Stop vertical velocity
                 this.isOnGround = true;
                 this.canJump = true;
            } else if (this.isOnGround) {
                 // Already on ground, ensure snapping if slightly below
                 this.mesh.position.y = Math.max(this.mesh.position.y, groundY);
            } else {
                // Found ground but too far above it (e.g., jumping up past it)
                this.isOnGround = false;
                this.canJump = false;
            }

        } else {
            // No ground detected within range or player is high above it
            this.isOnGround = false;
            this.canJump = false;
        }
    }


    private handleFallDamage(fallSpeed: number): void {
        const damageThreshold = 10.0; // Speed threshold for taking damage
        const damageFactor = 4.0;    // Damage scaling factor

        if (fallSpeed > damageThreshold) {
            const damage = Math.round((fallSpeed - damageThreshold) * damageFactor);
            if (damage > 0) {
                this.eventLog?.addEntry(`Ouch! That hurt! (-${damage} HP)`);
                this.takeDamage(damage);
            }
        }
    }

    private animateMovement(deltaTime: number): void {
        // Simple procedural leg/arm swing based on velocity
        const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
        const maxSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
        const speedRatio = maxSpeed > 0 ? THREE.MathUtils.clamp(horizontalSpeed / maxSpeed, 0, 1) : 0;

        const bobFrequency = this.isSprinting ? 14 : 8;
        const bobAmplitude = 0.8; // Radians for swing
        const restLerpFactor = 1.0 - Math.pow(0.01, deltaTime); // Smooth return to rest

        if (speedRatio > 0.1 && this.isOnGround) {
            const time = performance.now() * 0.001;
            const phase = time * bobFrequency;
            const angle = Math.sin(phase) * bobAmplitude * speedRatio;

            if (this.rightArm) this.rightArm.rotation.x = angle;
            if (this.leftArm) this.leftArm.rotation.x = -angle;
            if (this.rightLeg) this.rightLeg.rotation.x = -angle * 0.8;
            if (this.leftLeg) this.leftLeg.rotation.x = angle * 0.8;
        } else {
            // Lerp limbs back to resting position
            if (this.rightArm) this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, restLerpFactor);
            if (this.leftArm) this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, restLerpFactor);
            if (this.rightLeg) this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, restLerpFactor);
            if (this.leftLeg) this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, restLerpFactor);
        }
    }

    override die(): void {
        if (this.isDead) return;
        super.die(); // Call base Entity.die()
        console.log("Player has died.");
        this.eventLog?.addEntry("You have died!");
        // Game class handles respawn logic trigger
    }

    public respawn(position: THREE.Vector3): void {
        this.setPosition(position);
        this.health = this.maxHealth * 0.75; // Respawn with partial health
        this.stamina = this.maxStamina;
        this.velocity.set(0, 0, 0);
        this.isDead = false;
        this.isExhausted = false;
        this.isOnGround = false; // Recalculate ground state
        this.canJump = false;
        this.lastVelocityY = 0;

        console.log("Player respawned.");
        this.eventLog?.addEntry("You feel slightly disoriented but alive.");
        this.updateBoundingBox(); // Ensure box is correct at new position
    }

    override updateBoundingBox(): void {
        if (!this.mesh) return;
        const height = this.userData.height ?? PLAYER_HEIGHT;
        const radius = this.userData.radius ?? PLAYER_RADIUS;
        // Center the box based on the mesh position (assumed to be at the base)
        const center = this.mesh.position.clone();
        center.y += height / 2;
        const size = new THREE.Vector3(radius * 2, height, radius * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        this.userData.boundingBox = this.boundingBox; // Update reference
    }
}