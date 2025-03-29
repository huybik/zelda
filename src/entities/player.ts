// File: /src/entities/player.ts
// Optimization: Minor cleanup, slight simplification in checkGround.

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
    public maxStamina: number; public stamina: number;
    public walkSpeed: number; public runSpeed: number;
    public jumpForce: number;
    public staminaDrainRate: number; public staminaRegenRate: number; public staminaJumpCost: number;

    public canJump: boolean; public isSprinting: boolean; public isExhausted: boolean;
    public exhaustionThreshold: number; public moveState: MoveState;

    private gravity: number; public isOnGround: boolean;
    private groundCheckDistance: number; private lastVelocityY: number;

    private headMesh?: THREE.Mesh; private leftArm?: THREE.Mesh; private rightArm?: THREE.Mesh;
    private leftLeg?: THREE.Mesh; private rightLeg?: THREE.Mesh;

    public questLog: QuestLog | null = null; public eventLog: EventLog | null = null;

    constructor(scene: THREE.Scene, position: THREE.Vector3) {
        super(scene, position, 'Player');
        this.userData.isPlayer = true; this.userData.isCollidable = true; this.userData.isInteractable = false;

        this.maxHealth = 100; this.health = this.maxHealth;
        this.maxStamina = 100; this.stamina = this.maxStamina;
        this.walkSpeed = 4.0; this.runSpeed = 8.0; this.jumpForce = 8.0;
        this.staminaDrainRate = 15; this.staminaRegenRate = 10; this.staminaJumpCost = 10;

        this.canJump = false; this.isSprinting = false; this.isExhausted = false;
        this.exhaustionThreshold = 20;
        this.moveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false };

        this.gravity = -25; this.isOnGround = false;
        this.groundCheckDistance = 0.15; this.lastVelocityY = 0;

        this.createModel();
        this.updateBoundingBox();
    }

    public setJournal(questLog: QuestLog, eventLog: EventLog): void {
        this.questLog = questLog; this.eventLog = eventLog;
    }

    private createModel(): void {
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x0077ff });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 });
        const limbMat = bodyMat;

        const limbRadius = 0.15, armLength = 0.8, legLength = 0.9;
        const bodyHeight = 1.0, headRadiusVal = 0.3;

        // Body
        const bodyGeo = new THREE.BoxGeometry(0.8, bodyHeight, 0.5);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = legLength + bodyHeight / 2;
        bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; this.mesh.add(bodyMesh);

        // Head
        const headGeo = new THREE.SphereGeometry(headRadiusVal, 16, 16);
        this.headMesh = new THREE.Mesh(headGeo, headMat);
        this.headMesh.position.y = bodyMesh.position.y + bodyHeight / 2 + headRadiusVal;
        this.headMesh.castShadow = true; this.mesh.add(this.headMesh);

        // Limbs (helper function)
        const addLimb = (isArm: boolean, isLeft: boolean): THREE.Mesh => {
            const length = isArm ? armLength : legLength;
            const geo = new THREE.CylinderGeometry(limbRadius, limbRadius * (isArm ? 0.9 : 1.1), length, 8);
            geo.translate(0, -length / 2, 0); // Pivot at top
            const mesh = new THREE.Mesh(geo, limbMat);
            const offsetY = isArm ? bodyMesh.position.y + bodyHeight * 0.4 : bodyMesh.position.y - bodyHeight / 2;
            const offsetX = (isArm ? 0.5 : 0.2) * (isLeft ? -1 : 1);
            mesh.position.set(offsetX, offsetY, 0);
            mesh.castShadow = true; this.mesh.add(mesh);
            return mesh;
        };

        this.leftArm = addLimb(true, true); this.rightArm = addLimb(true, false);
        this.leftLeg = addLimb(false, true); this.rightLeg = addLimb(false, false);

        this.userData.height = PLAYER_HEIGHT; this.userData.radius = PLAYER_RADIUS;
    }

    override update(deltaTime: number, moveState: MoveState, collidables: THREE.Object3D[]): void {
        if (this.isDead) return;
        this.moveState = moveState;
        const wasOnGround = this.isOnGround;

        this.handleStamina(deltaTime);
        this.handleMovement(deltaTime);
        this.applyGravity(deltaTime);

        // Apply velocity & check ground
        this.mesh.position.x += this.velocity.x * deltaTime;
        this.mesh.position.z += this.velocity.z * deltaTime;
        this.checkGround(collidables);
        this.mesh.position.y += this.velocity.y * deltaTime;

        // Fall Damage
        if (this.isOnGround && !wasOnGround && this.lastVelocityY < -1.0) {
            this.handleFallDamage(Math.abs(this.lastVelocityY));
        }
        this.lastVelocityY = this.velocity.y;

        this.animateMovement(deltaTime);
        this.updateBoundingBox();
    }

    private handleStamina(deltaTime: number): void {
        const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
        this.isSprinting = this.moveState.sprint && isMoving && !this.isExhausted && this.stamina > 0;

        if (this.isSprinting) {
            this.stamina -= this.staminaDrainRate * deltaTime;
            if (this.stamina <= 0) {
                this.stamina = 0; this.isExhausted = true; this.isSprinting = false;
                this.eventLog?.addEntry("You are exhausted!");
            }
        } else {
            let regenMultiplier = this.isExhausted ? 0.5 : 1.0;
            this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * regenMultiplier * deltaTime);
            if (this.isExhausted && this.stamina >= this.exhaustionThreshold) {
                this.isExhausted = false; this.eventLog?.addEntry("You feel recovered.");
            }
        }
    }

    private handleMovement(deltaTime: number): void {
        const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
        _forward.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        _right.set(1, 0, 0).applyQuaternion(this.mesh.quaternion);
        _moveDirection.set(this.moveState.right, 0, this.moveState.forward).normalize();

        _moveVelocity.set(0, 0, 0)
            .addScaledVector(_forward, _moveDirection.z)
            .addScaledVector(_right, _moveDirection.x);

        if (_moveDirection.lengthSq() > 0) _moveVelocity.normalize().multiplyScalar(currentSpeed);

        this.velocity.x = _moveVelocity.x; this.velocity.z = _moveVelocity.z;

        // Jump
        if (this.moveState.jump && this.canJump && this.stamina >= this.staminaJumpCost) {
            this.velocity.y = this.jumpForce;
            this.stamina -= this.staminaJumpCost;
            this.canJump = false; this.isOnGround = false;
            if (this.stamina <= 0 && !this.isExhausted) { // Check exhaustion post-jump
                this.isExhausted = true; this.eventLog?.addEntry("You are exhausted!");
            }
        }
    }

    private applyGravity(deltaTime: number): void {
        if (!this.isOnGround || this.velocity.y > 0) {
            this.velocity.y += this.gravity * deltaTime;
        } else {
            this.velocity.y = Math.max(this.gravity * deltaTime, -0.1); // Keep slightly negative on ground
        }
    }

    private checkGround(collidables: THREE.Object3D[]): void {
        _groundCheckOrigin.copy(this.mesh.position).y += 0.1;
        const rayLength = 0.1 + this.groundCheckDistance;
        const raycaster = new THREE.Raycaster(_groundCheckOrigin, _groundCheckDirection, 0, rayLength);
        const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj?.userData?.isCollidable);
        const intersects = raycaster.intersectObjects(checkAgainst, true);

        let groundY = -Infinity;
        const foundGround = intersects.some(intersect => {
            if (intersect.distance > 0.01) {
                groundY = Math.max(groundY, intersect.point.y);
                return true;
            }
            return false;
        });

        if (foundGround && this.mesh.position.y <= groundY + rayLength + 0.05) { // Check against groundY + raycast reach
            if (this.velocity.y <= 0) { // Allow landing or staying grounded
                 this.mesh.position.y = groundY; // Snap
                 this.velocity.y = 0;
                 this.isOnGround = true;
                 this.canJump = true;
            } else { // Moving upwards past ground
                 this.isOnGround = false;
                 this.canJump = false;
            }
        } else { // No ground found or too high above it
            this.isOnGround = false;
            this.canJump = false;
        }
    }

    private handleFallDamage(fallSpeed: number): void {
        const damageThreshold = 10.0, damageFactor = 4.0;
        if (fallSpeed > damageThreshold) {
            const damage = Math.round((fallSpeed - damageThreshold) * damageFactor);
            if (damage > 0) {
                this.eventLog?.addEntry(`Ouch! That hurt! (-${damage} HP)`);
                this.takeDamage(damage);
            }
        }
    }

    private animateMovement(deltaTime: number): void {
        const horizontalSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        const maxSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
        const speedRatio = maxSpeed > 0 ? THREE.MathUtils.clamp(horizontalSpeed / maxSpeed, 0, 1) : 0;
        const bobFrequency = this.isSprinting ? 14 : 8;
        const bobAmplitude = 0.8; // Radians
        const restLerpFactor = 1.0 - Math.pow(0.01, deltaTime);

        if (speedRatio > 0.1 && this.isOnGround) {
            const phase = performance.now() * 0.001 * bobFrequency;
            const angle = Math.sin(phase) * bobAmplitude * speedRatio;
            if (this.rightArm) this.rightArm.rotation.x = angle;
            if (this.leftArm) this.leftArm.rotation.x = -angle;
            if (this.rightLeg) this.rightLeg.rotation.x = -angle * 0.8;
            if (this.leftLeg) this.leftLeg.rotation.x = angle * 0.8;
        } else { // Lerp back to rest
            [this.rightArm, this.leftArm, this.rightLeg, this.leftLeg].forEach(limb => {
                if (limb) limb.rotation.x = THREE.MathUtils.lerp(limb.rotation.x, 0, restLerpFactor);
            });
        }
    }

    override die(): void {
        if (this.isDead) return;
        super.die();
        console.log("Player has died.");
        this.eventLog?.addEntry("You have died!");
        // Respawn handled by Game class
    }

    public respawn(position: THREE.Vector3): void {
        this.setPosition(position);
        this.health = this.maxHealth * 0.75; this.stamina = this.maxStamina;
        this.velocity.set(0, 0, 0); this.isDead = false; this.isExhausted = false;
        this.isOnGround = false; this.canJump = false; this.lastVelocityY = 0;
        console.log("Player respawned.");
        this.eventLog?.addEntry("You feel slightly disoriented but alive.");
        this.updateBoundingBox();
    }

    override updateBoundingBox(): void {
        if (!this.mesh) return;
        const height = this.userData.height ?? PLAYER_HEIGHT;
        const radius = this.userData.radius ?? PLAYER_RADIUS;
        const center = this.mesh.position.clone().add(new THREE.Vector3(0, height / 2, 0));
        const size = new THREE.Vector3(radius * 2, height, radius * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        this.userData.boundingBox = this.boundingBox;
    }
}