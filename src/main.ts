import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';


export interface EntityUserData {
    entityReference: any;
    isEntity: boolean;
    isPlayer: boolean;
    isNPC: boolean;
    isCollidable: boolean;
    isInteractable: boolean;
    interactionType?: string;
    prompt?: string;
    id: string;
    boundingBox?: THREE.Box3;
    height?: number;
    width?: number;
    depth?: number;
    [key: string]: any;
}

export interface InteractionResult {
    type: 'reward' | 'message' | 'dialogue' | 'item_retrieved' | 'error' | 'gather_start' | 'open_result';
    item?: { name: string; amount: number };
    message?: string;
    text?: string;
    state?: string;
}

export interface TargetInfo {
    mesh: THREE.Object3D;
    instance: any;
    point: THREE.Vector3;
    distance: number;
}

export interface ActiveGather {
    targetInstance: any;
    startTime: number;
    duration: number;
    resource: string;
}

export interface InventoryItem {
    name: string;
    count: number;
    icon?: string;
    data?: any;
}

export interface EventEntry {
    timestamp: string;
    message: string;
}

export interface KeyState {
    [key: string]: boolean | undefined;
}

export interface MouseState {
    x: number;
    y: number;
    dx: number;
    dy: number;
    buttons: { [key: number]: boolean | undefined };
}

export interface MoveState {
    forward: number;
    right: number;
    jump: boolean;
    sprint: boolean;
    interact: boolean;
}


export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}

export function distanceXZ(vec1: THREE.Vector3, vec2: THREE.Vector3): number {
    const dx = vec1.x - vec2.x;
    const dz = vec1.z - vec2.z;
    return Math.sqrt(dx * dx + dz * dz);
}

export function distanceXZSq(vec1: THREE.Vector3, vec2: THREE.Vector3): number {
    const dx = vec1.x - vec2.x;
    const dz = vec1.z - vec2.z;
    return dx * dx + dz * dz;
}

export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function smoothLerp(start: number, end: number, alphaBase: number, deltaTime: number): number {
    if (alphaBase <= 0) return end;
    if (alphaBase >= 1) return start;
    const factor = 1.0 - Math.pow(alphaBase, deltaTime);
    return start + (end - start) * factor;
}

export function smoothVectorLerp(current: THREE.Vector3, target: THREE.Vector3, alphaBase: number, deltaTime: number): THREE.Vector3 {
     if (alphaBase <= 0) return current.copy(target);
     if (alphaBase >= 1) return current;
    const factor = 1.0 - Math.pow(alphaBase, deltaTime);
    return current.lerp(target, factor);
}

export function smoothQuaternionSlerp(current: THREE.Quaternion, target: THREE.Quaternion, alphaBase: number, deltaTime: number): THREE.Quaternion {
     if (alphaBase <= 0) return current.copy(target);
     if (alphaBase >= 1) return current;
    const factor = 1.0 - Math.pow(alphaBase, deltaTime);
    return current.slerp(target, factor);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
    x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
}

export const Colors = {
    PASTEL_GREEN: 0x98FB98,
    PASTEL_BROWN: 0xCD853F,
    PASTEL_GRAY: 0xB0C4DE,
    PASTEL_ROOF: 0xFFA07A,
    FOREST_GREEN: 0x228B22,
    SADDLE_BROWN: 0x8B4513,
    SIENNA: 0xA0522D,
    DIM_GRAY: 0x696969,
    PEACH_PUFF: 0xFFDAB9,
    SNOW_WHITE: 0xFFFAFA,
    BEIGE: 0xF5F5DC,
} as const;


let nextEntityId = 0;

export class Entity {
    public id: string;
    public scene: THREE.Scene | null;
    public mesh: THREE.Group;
    public name: string;
    public velocity: THREE.Vector3;
    public boundingBox: THREE.Box3;
    public health: number;
    public maxHealth: number;
    public isDead: boolean;
    public userData: EntityUserData;

    constructor(scene: THREE.Scene, position: THREE.Vector3, name: string = 'Entity') {
        if (!scene || !position) {
            throw new Error("Scene and position are required for Entity creation.");
        }
        this.id = `${name}_${nextEntityId++}`;
        this.scene = scene;
        this.name = name;
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);
        this.velocity = new THREE.Vector3();
        this.boundingBox = new THREE.Box3();

        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;

        this.userData = {
            entityReference: this,
            isEntity: true,
            isPlayer: false,
            isNPC: false,
            isCollidable: true,
            isInteractable: false,
            id: this.id,
        };
        this.mesh.userData = this.userData;
        this.mesh.name = this.name;

        this.scene.add(this.mesh);
    }

    update(deltaTime: number, player?: Entity, collidables?: THREE.Object3D[]): void {
    }

    updateBoundingBox(): void {
        if (!this.mesh) return;
        this.boundingBox.setFromObject(this.mesh, false);
        this.userData.boundingBox = this.boundingBox;
    }

    setPosition(position: THREE.Vector3): void {
        if (this.mesh) {
            this.mesh.position.copy(position);
            this.updateBoundingBox();
        }
    }

    lookAt(targetPosition: THREE.Vector3): void {
        if (this.mesh) {
            const target = targetPosition.clone();
            target.y = this.mesh.position.y;
            if (target.distanceToSquared(this.mesh.position) < 0.001) return;
            this.mesh.lookAt(target);
        }
    }

    takeDamage(amount: number): void {
        if (this.isDead || amount <= 0) return;

        this.health = Math.max(0, this.health - amount);
        console.log(`${this.name} took ${amount} damage. Health: ${this.health}/${this.maxHealth}`);

        if (this.health <= 0) {
            this.die();
        }
    }

    heal(amount: number): void {
        if (this.isDead || amount <= 0) return;

        this.health = Math.min(this.maxHealth, this.health + amount);
        console.log(`${this.name} healed ${amount}. Health: ${this.health}/${this.maxHealth}`);
    }

    die(): void {
        if (this.isDead) return;
        console.log(`${this.name} has died.`);
        this.isDead = true;
        this.velocity.set(0, 0, 0);
        this.health = 0;
        this.userData.isCollidable = false;
        this.userData.isInteractable = false;
    }

    destroy(): void {
        console.log(`Destroying ${this.name}...`);
        if (this.mesh && this.scene) {
            this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat?.dispose());
                        } else {
                            child.material?.dispose();
                        }
                    }
                }
            });
            this.scene.remove(this.mesh);
        }
        this.mesh = null!;
        this.scene = null;
        this.userData.entityReference = null;
    }
}


const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDirection = new THREE.Vector3();
const _moveVelocity = new THREE.Vector3();
const _groundCheckOrigin = new THREE.Vector3();
const _groundCheckDirection = new THREE.Vector3(0, -1, 0);

export class Player extends Entity {
    public maxStamina: number;
    public stamina: number;
    public walkSpeed: number;
    public runSpeed: number;
    public jumpForce: number;
    public staminaDrainRate: number;
    public staminaRegenRate: number;
    public staminaJumpCost: number;

    public canJump: boolean;
    public isSprinting: boolean;
    public isExhausted: boolean;
    public exhaustionThreshold: number;
    public moveState: MoveState;

    private gravity: number;
    public isOnGround: boolean;
    private groundCheckDistance: number;
    private lastVelocityY: number;

    private headMesh?: THREE.Mesh;
    private leftArm?: THREE.Mesh;
    private rightArm?: THREE.Mesh;
    private leftLeg?: THREE.Mesh;
    private rightLeg?: THREE.Mesh;

    public eventLog: EventLog | null = null;

    constructor(scene: THREE.Scene, position: THREE.Vector3) {
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

        this.moveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false };

        this.gravity = -25;
        this.isOnGround = false;
        this.groundCheckDistance = 0.15;
        this.lastVelocityY = 0;

        this.createModel();
        this.updateBoundingBox();
    }

    public setEventLog(eventLog: EventLog): void {
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
        const headRadiusVal = 0.3;

        const bodyGeo = new THREE.BoxGeometry(0.8, bodyHeight, 0.5);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = legLength + bodyHeight / 2;
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        const headGeo = new THREE.SphereGeometry(headRadiusVal, 16, 16);
        this.headMesh = new THREE.Mesh(headGeo, headMat);
        this.headMesh.position.y = bodyMesh.position.y + bodyHeight / 2 + headRadiusVal;
        this.headMesh.castShadow = true;
        this.mesh.add(this.headMesh);

        const armOffsetY = bodyMesh.position.y + bodyHeight * 0.4;
        const armOffsetX = 0.5;
        const leftArmGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 0.9, armLength, 8);
        leftArmGeo.translate(0, -armLength / 2, 0);
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

        const legOffsetY = bodyMesh.position.y - bodyHeight / 2;
        const legOffsetX = 0.2;
        const leftLegGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
        leftLegGeo.translate(0, -legLength / 2, 0);
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

        this.userData.height = PLAYER_HEIGHT;
        this.userData.radius = PLAYER_RADIUS;
    }

    override update(deltaTime: number, moveState: MoveState, collidables: THREE.Object3D[]): void {
        if (this.isDead) return;

        this.moveState = moveState;

        const wasOnGround = this.isOnGround;

        this.handleStamina(deltaTime);
        this.handleMovement(deltaTime);

        this.applyGravity(deltaTime);
        this.mesh.position.x += this.velocity.x * deltaTime;
        this.mesh.position.z += this.velocity.z * deltaTime;
        this.checkGround(collidables);
        this.mesh.position.y += this.velocity.y * deltaTime;

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
                this.stamina = 0;
                this.isExhausted = true;
                this.isSprinting = false;
                this.eventLog?.addEntry("You are exhausted!");
            }
        } else {
            let regenRate = this.staminaRegenRate;
            if (this.isExhausted) {
                regenRate /= 2;
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

        _forward.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        _right.set(1, 0, 0).applyQuaternion(this.mesh.quaternion);

        _moveDirection.set(this.moveState.right, 0, this.moveState.forward).normalize();

        _moveVelocity.set(0, 0, 0)
            .addScaledVector(_forward, _moveDirection.z)
            .addScaledVector(_right, _moveDirection.x);

        if (_moveDirection.lengthSq() > 0) {
            _moveVelocity.normalize().multiplyScalar(currentSpeed);
        }

        this.velocity.x = _moveVelocity.x;
        this.velocity.z = _moveVelocity.z;

        if (this.moveState.jump && this.canJump && this.stamina >= this.staminaJumpCost) {
            this.velocity.y = this.jumpForce;
            this.stamina -= this.staminaJumpCost;
            this.canJump = false;
            this.isOnGround = false;
            if (this.stamina <= 0 && !this.isExhausted) {
                this.isExhausted = true;
                 this.eventLog?.addEntry("You are exhausted!");
            }
        }
    }

    private applyGravity(deltaTime: number): void {
        if (!this.isOnGround || this.velocity.y > 0) {
            this.velocity.y += this.gravity * deltaTime;
        } else {
            this.velocity.y = Math.max(this.gravity * deltaTime, -0.1);
        }
    }

    private checkGround(collidables: THREE.Object3D[]): void {
        _groundCheckOrigin.copy(this.mesh.position);
        _groundCheckOrigin.y += 0.1;
        const rayLength = 0.1 + this.groundCheckDistance;

        const raycaster = new THREE.Raycaster(_groundCheckOrigin, _groundCheckDirection, 0, rayLength);
        const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj?.userData?.isCollidable);
        const intersects = raycaster.intersectObjects(checkAgainst, true);

        let foundGround = false;
        let groundY = -Infinity;

        if (intersects.length > 0) {
            for (const intersect of intersects) {
                if (intersect.distance > 0.01) {
                    groundY = Math.max(groundY, intersect.point.y);
                    foundGround = true;
                }
            }
        }

        const playerBaseY = this.mesh.position.y;
        const snapThreshold = 0.05;

        if (foundGround && playerBaseY <= groundY + this.groundCheckDistance + snapThreshold) {
            if (!this.isOnGround && this.velocity.y <= 0) {
                 this.mesh.position.y = groundY;
                 this.velocity.y = 0;
                 this.isOnGround = true;
                 this.canJump = true;
            } else if (this.isOnGround) {
                 this.mesh.position.y = Math.max(this.mesh.position.y, groundY);
            } else {
                this.isOnGround = false;
                this.canJump = false;
            }

        } else {
            this.isOnGround = false;
            this.canJump = false;
        }
    }


    private handleFallDamage(fallSpeed: number): void {
        const damageThreshold = 10.0;
        const damageFactor = 4.0;

        if (fallSpeed > damageThreshold) {
            const damage = Math.round((fallSpeed - damageThreshold) * damageFactor);
            if (damage > 0) {
                this.eventLog?.addEntry(`Ouch! That hurt! (-${damage} HP)`);
                this.takeDamage(damage);
            }
        }
    }

    private animateMovement(deltaTime: number): void {
        const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
        const maxSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
        const speedRatio = maxSpeed > 0 ? THREE.MathUtils.clamp(horizontalSpeed / maxSpeed, 0, 1) : 0;

        const bobFrequency = this.isSprinting ? 14 : 8;
        const bobAmplitude = 0.8;
        const restLerpFactor = 1.0 - Math.pow(0.01, deltaTime);

        if (speedRatio > 0.1 && this.isOnGround) {
            const time = performance.now() * 0.001;
            const phase = time * bobFrequency;
            const angle = Math.sin(phase) * bobAmplitude * speedRatio;

            if (this.rightArm) this.rightArm.rotation.x = angle;
            if (this.leftArm) this.leftArm.rotation.x = -angle;
            if (this.rightLeg) this.rightLeg.rotation.x = -angle * 0.8;
            if (this.leftLeg) this.leftLeg.rotation.x = angle * 0.8;
        } else {
            if (this.rightArm) this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, restLerpFactor);
            if (this.leftArm) this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, restLerpFactor);
            if (this.rightLeg) this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, restLerpFactor);
            if (this.leftLeg) this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, restLerpFactor);
        }
    }

    override die(): void {
        if (this.isDead) return;
        super.die();
        console.log("Player has died.");
        this.eventLog?.addEntry("You have died!");
    }

    public respawn(position: THREE.Vector3): void {
        this.setPosition(position);
        this.health = this.maxHealth * 0.75;
        this.stamina = this.maxStamina;
        this.velocity.set(0, 0, 0);
        this.isDead = false;
        this.isExhausted = false;
        this.isOnGround = false;
        this.canJump = false;
        this.lastVelocityY = 0;

        console.log("Player respawned.");
        this.eventLog?.addEntry("You feel slightly disoriented but alive.");
        this.updateBoundingBox();
    }

    override updateBoundingBox(): void {
        if (!this.mesh) return;
        const height = this.userData.height ?? PLAYER_HEIGHT;
        const radius = this.userData.radius ?? PLAYER_RADIUS;
        const center = this.mesh.position.clone();
        center.y += height / 2;
        const size = new THREE.Vector3(radius * 2, height, radius * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        this.userData.boundingBox = this.boundingBox;
    }
}


const _playerPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _targetDirection = new THREE.Vector3();
const _targetQuaternion = new THREE.Quaternion();
const _tempMatrix = new THREE.Matrix4();

type AccessoryType = 'none' | 'straw_hat' | 'cap';
type DialogueState = 'idle' | 'greeting';

export class NPC extends Entity {
    public accessoryType: AccessoryType;
    public inventory: Inventory | null;

    public dialogueState: DialogueState;
    public interactionPrompt: string;

    private idleTimer: number;
    private idleLookTarget: THREE.Vector3;
    private baseQuaternion: THREE.Quaternion;
    private baseForward: THREE.Vector3;

    constructor(
        scene: THREE.Scene,
        position: THREE.Vector3,
        name: string,
        accessoryType: AccessoryType = 'none',
        inventory: Inventory | null
    ) {
        super(scene, position, name);
        this.userData.isNPC = true;
        this.userData.isCollidable = true;
        this.userData.isInteractable = true;
        this.userData.interactionType = 'talk';

        this.accessoryType = accessoryType;
        this.inventory = inventory;

        this.dialogueState = 'idle';
        this.interactionPrompt = `Press E to talk to ${this.name}`;
        this.userData.prompt = this.interactionPrompt;

        this.createModel();

        this.idleTimer = 2 + Math.random() * 3;
        this.idleLookTarget = new THREE.Vector3();
        this.mesh.updateMatrixWorld();
        this.baseQuaternion = this.mesh.quaternion.clone();
        this.baseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.baseQuaternion);
        this.idleLookTarget.copy(this.mesh.position).addScaledVector(this.baseForward, 5);

        this.updateBoundingBox();
    }

    private createModel(): void {
        const bodyMat = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 });

        const bodyHeight = 1.1;
        const headRadius = 0.3;

        const bodyGeo = new THREE.BoxGeometry(0.7, bodyHeight, 0.4);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = bodyHeight / 2;
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = bodyHeight + headRadius;
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        this.addAccessory(headMesh.position);

        this.userData.height = bodyHeight + headRadius * 2;
    }

    private addAccessory(headPosition: THREE.Vector3): void {
        let accessory: THREE.Object3D | null = null;
        let accessoryMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });

        switch (this.accessoryType) {
            case 'straw_hat':
                accessoryMat = new THREE.MeshLambertMaterial({ color: 0xFFEC8B });
                const brimGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.1, 16);
                const topGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.3, 16);
                accessory = new THREE.Group();
                const brimMesh = new THREE.Mesh(brimGeo, accessoryMat);
                const topMesh = new THREE.Mesh(topGeo, accessoryMat);
                topMesh.position.y = 0.15;
                accessory.add(brimMesh, topMesh);
                accessory.position.set(headPosition.x, headPosition.y + 0.25, headPosition.z);
                break;
            case 'cap':
                accessoryMat = new THREE.MeshLambertMaterial({ color: 0x4682B4 });
                const capGeo = new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
                accessory = new THREE.Mesh(capGeo, accessoryMat);
                accessory.position.set(headPosition.x, headPosition.y + 0.1, headPosition.z);
                accessory.rotation.x = -0.1;
                break;
        }

        if (accessory) {
            accessory.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
            this.mesh.add(accessory);
        }
    }

    public interact(player: Player): InteractionResult | null {
        console.log(`Interacting with ${this.name}`);
        let dialogue: string = `Hello there, ${player.name}.`;
        let interactionResultType: InteractionResult['type'] = 'dialogue';

        _playerPos.copy(player.mesh.position);
        _playerPos.y = this.mesh.position.y;
        this.mesh.lookAt(_playerPos);
        this.idleLookTarget.copy(_playerPos);
        this.idleTimer = 3.0;

        dialogue = this.getRandomIdleDialogue();
        this.dialogueState = 'greeting';

        console.log(`${this.name}: ${dialogue}`);
        player.eventLog?.addEntry(`${this.name}: "${dialogue}"`);

        return { type: interactionResultType, text: dialogue, state: this.dialogueState };
    }

    private getRandomIdleDialogue(): string {
        const dialogues = [
            "Nice weather today.", "Be careful out there.", "Seen any trouble makers around?",
            "The wilderness holds many secrets.", "Welcome to our village.", "Need something?",
            "Don't wander too far from the village.",
        ];
        return dialogues[Math.floor(Math.random() * dialogues.length)];
    }

    override update(deltaTime: number, player: Player, collidables?: THREE.Object3D[]): void {
        this.idleTimer -= deltaTime;
        if (this.idleTimer <= 0) {
            this.idleTimer = 3 + Math.random() * 4;

            const distanceToPlayerSq = this.mesh.position.distanceToSquared(player.mesh.position);
            if (distanceToPlayerSq < 15 * 15 && Math.random() < 0.3) {
                _targetLookAt.copy(player.mesh.position).setY(this.mesh.position.y);
                this.idleLookTarget.copy(_targetLookAt);
            } else {
                if (Math.random() < 0.5) {
                    const randomAngleOffset = (Math.random() - 0.5) * Math.PI * 1.5;
                    const randomDirection = this.baseForward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), randomAngleOffset);
                    this.idleLookTarget.copy(this.mesh.position).addScaledVector(randomDirection, 5);
                } else {
                    this.idleLookTarget.copy(this.mesh.position).addScaledVector(this.baseForward, 5);
                }
            }
        }

        _targetDirection.copy(this.idleLookTarget).sub(this.mesh.position);
        _targetDirection.y = 0;
        if (_targetDirection.lengthSq() > 0.01) {
            _targetDirection.normalize();
             _targetLookAt.copy(this.mesh.position).add(_targetDirection);
             _tempMatrix.lookAt(_targetLookAt, this.mesh.position, this.mesh.up);
             _targetQuaternion.setFromRotationMatrix(_tempMatrix);

             smoothQuaternionSlerp(this.mesh.quaternion, _targetQuaternion, 0.05, deltaTime);
        }
    }

    override updateBoundingBox(): void {
        if (!this.mesh) return;
        const height = this.userData.height ?? 1.7;
        const radius = 0.4;
        const center = this.mesh.position.clone().add(new THREE.Vector3(0, height / 2, 0));
        const size = new THREE.Vector3(radius * 2, height, radius * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        this.userData.boundingBox = this.boundingBox;
    }
}

export class Inventory {
    public readonly size: number;
    public items: Array<InventoryItem | null>;
    private onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
    private itemMaxStack: Record<string, number>;

    constructor(size: number = 20) {
        if (size <= 0) throw new Error("Inventory size must be positive.");
        this.size = size;
        this.items = new Array(size).fill(null);
        this.onChangeCallbacks = [];

        this.itemMaxStack = {
            'default': 64, 'wood': 99, 'stone': 99, 'herb': 30, 'feather': 50,
            'Health Potion': 10, 'gold': Infinity, 'Hunter\'s Bow': 1
        };
    }

    private getMaxStack(itemName: string): number {
        return this.itemMaxStack[itemName] ?? this.itemMaxStack['default'];
    }

    public addItem(itemName: string, count: number = 1): boolean {
        if (!itemName || typeof itemName !== 'string' || count <= 0) {
            console.error("Invalid item name or count:", itemName, count);
            return false;
        }

        const maxStack = this.getMaxStack(itemName);
        let remainingCount = count;
        let changed = false;

        for (let i = 0; i < this.size && remainingCount > 0; i++) {
            const slot = this.items[i];
            if (slot?.name === itemName && slot.count < maxStack) {
                const canAdd = maxStack - slot.count;
                const amountToAdd = Math.min(remainingCount, canAdd);
                slot.count += amountToAdd;
                remainingCount -= amountToAdd;
                changed = true;
            }
        }

        if (remainingCount > 0) {
            for (let i = 0; i < this.size && remainingCount > 0; i++) {
                if (this.items[i] === null) {
                    const amountToAdd = Math.min(remainingCount, maxStack);
                    this.items[i] = {
                        name: itemName, count: amountToAdd, icon: this.generateIconName(itemName)
                    };
                    remainingCount -= amountToAdd;
                    changed = true;
                }
            }
        }

        if (changed) this.notifyChange();

        if (remainingCount > 0) {
            console.log(`Inventory full. Could not add ${remainingCount} of ${itemName}.`);
            return false;
        }

        return true;
    }

    public removeItem(itemName: string, count: number = 1): boolean {
        if (!itemName || count <= 0) return false;

        let countRemoved = 0;
        let neededToRemove = count;
        let changed = false;

        for (let i = this.size - 1; i >= 0 && neededToRemove > 0; i--) {
            const slot = this.items[i];
            if (slot?.name === itemName) {
                const amountToRemove = Math.min(neededToRemove, slot.count);
                slot.count -= amountToRemove;
                countRemoved += amountToRemove;
                neededToRemove -= amountToRemove;
                changed = true;

                if (slot.count === 0) {
                    this.items[i] = null;
                }
            }
        }

        if (changed) this.notifyChange();

        if (neededToRemove > 0) {
            console.warn(`Could not remove all ${count} of ${itemName}. Removed ${countRemoved}.`);
            return false;
        }

        return true;
    }

    public removeItemByIndex(index: number, count: number = 1): boolean {
        if (index < 0 || index >= this.size || !this.items[index] || count <= 0) {
            return false;
        }

        const item = this.items[index]!;
        const removeCount = Math.min(count, item.count);

        if (removeCount <= 0) return false;

        item.count -= removeCount;

        if (item.count === 0) {
            this.items[index] = null;
        }

        this.notifyChange();
        return true;
    }

    public hasItem(itemName: string, count: number = 1): boolean {
        if (count <= 0) return true;
        return this.countItem(itemName) >= count;
    }

    public countItem(itemName: string): number {
        let totalCount = 0;
        for (const item of this.items) {
            if (item?.name === itemName) {
                totalCount += item.count;
            }
        }
        return totalCount;
    }

    public getItem(index: number): InventoryItem | null {
        return (index >= 0 && index < this.size) ? this.items[index] : null;
    }

    public getAllItems(): Array<InventoryItem | null> {
        return this.items.map(item => item ? { ...item } : null);
    }

    public getFilledSlots(): InventoryItem[] {
        return this.items.filter((item): item is InventoryItem => item !== null)
                         .map(item => ({ ...item }));
    }

    public onChange(callback: (items: Array<InventoryItem | null>) => void): void {
        if (typeof callback === 'function') {
            this.onChangeCallbacks.push(callback);
        }
    }

    public removeOnChange(callback: (items: Array<InventoryItem | null>) => void): void {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

    private notifyChange(): void {
        const itemsCopy = this.getAllItems();
        this.onChangeCallbacks.forEach(cb => {
            try {
                cb(itemsCopy);
            } catch (error) {
                console.error("Error in inventory onChange callback:", error);
            }
        });
    }

    private generateIconName(itemName: string): string {
        return itemName.toLowerCase().replace(/ /g, '_').replace(/'/g, '');
    }

    public getSaveData(): Array<Pick<InventoryItem, 'name' | 'count'> | null> {
        return this.items.map(item => item ? { name: item.name, count: item.count } : null);
    }

    public loadSaveData(savedItems: Array<Pick<InventoryItem, 'name' | 'count'> | null>): void {
        if (!Array.isArray(savedItems) || savedItems.length !== this.size) {
            console.error("Invalid inventory save data format or size mismatch.");
            this.items.fill(null);
        } else {
            this.items = savedItems.map(savedItem => {
                if (savedItem?.name && savedItem.count > 0) {
                    return {
                        name: savedItem.name, count: savedItem.count,
                        icon: this.generateIconName(savedItem.name)
                    };
                }
                return null;
            });
        }
        console.log("Inventory loaded.");
        this.notifyChange();
    }
}


export class EventLog {
    private entries: EventEntry[];
    private readonly maxEntries: number;
    private onChangeCallbacks: Array<(entries: string[]) => void>;

    constructor(maxEntries: number = 50) {
        this.entries = [];
        this.maxEntries = Math.max(1, maxEntries);
        this.onChangeCallbacks = [];
    }

    public addEntry(message: string): void {
        if (!message || typeof message !== 'string') return;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry: EventEntry = { timestamp, message };
        this.entries.push(entry);

        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }
        console.log("Event Log:", `[${timestamp}] ${message}`);
        this.notifyChange();
    }

    public getEntries(): EventEntry[] {
        return [...this.entries].reverse();
    }

    public getFormattedEntries(): string[] {
        return this.getEntries().map(entry => `[${entry.timestamp}] ${entry.message}`);
    }

    public onChange(callback: (entries: string[]) => void): void {
        if (typeof callback === 'function') {
            this.onChangeCallbacks.push(callback);
        }
    }
    public removeOnChange(callback: (entries: string[]) => void): void {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

    private notifyChange(): void {
        const formattedEntries = this.getFormattedEntries();
        this.onChangeCallbacks.forEach(cb => {
            try {
                cb(formattedEntries);
            } catch (error) {
                console.error("Error in eventLog onChange callback:", error);
            }
        });
    }

    public getSaveData(): EventEntry[] {
        return this.entries.slice(-20);
    }
    public loadSaveData(savedEntries: EventEntry[] | null): void {
        if (Array.isArray(savedEntries)) {
            this.entries = savedEntries.slice(-this.maxEntries);
            this.notifyChange();
            console.log("Event log loaded.");
        }
    }
}


const _camDir = new THREE.Vector3();
const _objDir = new THREE.Vector3();
const _playerDir = new THREE.Vector3();
const _objPos = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _tempBoxInteraction = new THREE.Box3();

export class InteractableObject {
    public id: string;
    public position: THREE.Vector3;
    public interactionType: string;
    public data: any;
    public prompt: string;
    public mesh: THREE.Mesh | THREE.Group | null;
    public isActive: boolean;
    public userData: EntityUserData;

    constructor(
        id: string, position: THREE.Vector3, interactionType: string,
        data: any, prompt: string, scene: THREE.Scene | null = null
    ) {
        this.id = id;
        this.position = position.clone();
        this.interactionType = interactionType;
        this.data = data;
        this.prompt = prompt;
        this.mesh = null;
        this.isActive = true;

        this.userData = {
            id: this.id, entityReference: this, isInteractable: true,
            interactionType: this.interactionType, prompt: this.prompt, data: this.data,
            isSimpleObject: true, isEntity: false, isPlayer: false, isNPC: false,
            isCollidable: false,
        };
    }

    interact(player: Player, inventory: Inventory, eventLog: EventLog): InteractionResult | null {
        if (!this.isActive) return { type: 'error', message: 'Already used.' };

        console.log(`Interacting with simple object: ${this.id} (${this.interactionType})`);
        switch (this.interactionType) {
            case 'retrieve':
                const itemName = this.data as string;
                if (inventory.addItem(itemName, 1)) {
                    eventLog?.addEntry(`You picked up: ${itemName}`);
                    this.removeFromWorld();
                    return { type: 'item_retrieved', item: { name: itemName, amount: 1 } };
                } else {
                    eventLog?.addEntry(`Your inventory is full.`);
                    return { type: 'error', message: 'Inventory full' };
                }

            case 'read_sign':
                const signText = this.data as string || "The sign is worn and illegible.";
                eventLog?.addEntry(`Sign: "${signText}"`);
                return { type: 'message', message: signText };

            default:
                console.warn(`Unhandled simple interaction type: ${this.interactionType}`);
                return { type: 'message', message: 'You look at the object.' };
        }
    }

    removeFromWorld(): void {
        this.isActive = false;
        this.userData.isInteractable = false;
        if (this.mesh) {
            this.mesh.visible = false;
             this.userData.isCollidable = false;
        }
    }

    update(deltaTime: number): void { }

    updateBoundingBox(): void {
        if (!this.userData.boundingBox) this.userData.boundingBox = new THREE.Box3();
        if (this.mesh) {
            this.userData.boundingBox.setFromObject(this.mesh);
        } else {
            this.userData.boundingBox.setFromCenterAndSize(this.position, _size.set(0.5, 0.5, 0.5));
        }
    }
}

export class InteractionSystem {
    private player: Player;
    private camera: THREE.PerspectiveCamera;
    private interactableEntities: Array<Entity | InteractableObject | THREE.Object3D>;
    private controls: Controls;
    private inventory: Inventory;
    private eventLog: EventLog;

    private raycaster: THREE.Raycaster;
    private interactionDistance: number;
    private aimTolerance: number;

    private currentTarget: Entity | InteractableObject | THREE.Object3D | null = null;
    private currentTargetMesh: THREE.Object3D | null = null;
    private interactionPromptElement: HTMLElement | null;

    private activeGather: ActiveGather | null = null;
    private promptTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        player: Player, camera: THREE.PerspectiveCamera,
        interactableEntities: Array<Entity | InteractableObject | THREE.Object3D>,
        controls: Controls, inventory: Inventory, eventLog: EventLog
    ) {
        this.player = player;
        this.camera = camera;
        this.interactableEntities = interactableEntities;
        this.controls = controls;
        this.inventory = inventory;
        this.eventLog = eventLog;

        this.raycaster = new THREE.Raycaster();
        this.interactionDistance = 3.0;
        this.aimTolerance = Math.PI / 6;

        this.interactionPromptElement = document.getElementById('interaction-prompt');
        if (!this.interactionPromptElement) {
            console.warn("Interaction prompt element (#interaction-prompt) not found.");
        }
    }

    update(deltaTime: number): void {
        if (this.activeGather) {
            const moved = this.player.velocity.lengthSq() * deltaTime > 0.001;
            if (moved || this.controls.consumeInteraction()) {
                this.cancelGatherAction();
                return;
            }
            this.updateGatherAction(deltaTime);
            return;
        }

        const targetInfo = this.findInteractableTarget();

        if (targetInfo?.instance?.userData?.isInteractable) {
            if (this.currentTarget !== targetInfo.instance) {
                this.currentTarget = targetInfo.instance;
                this.currentTargetMesh = targetInfo.mesh;
                const promptText = targetInfo.instance.userData.prompt || "Press E to interact";
                this.showPrompt(promptText);
            }

            if (this.controls.consumeInteraction()) {
                this.tryInteract(this.currentTarget, this.currentTargetMesh);
            }
        } else {
            if (this.currentTarget) {
                this.currentTarget = null;
                this.currentTargetMesh = null;
                this.hidePrompt();
            }
        }
    }

    private findInteractableTarget(): TargetInfo | null {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        this.raycaster.far = this.interactionDistance;

        const meshesToCheck = this.interactableEntities
            .map(item => (item as any).mesh ?? (item instanceof THREE.Object3D ? item : null))
            .filter((mesh): mesh is THREE.Object3D =>
                mesh instanceof THREE.Object3D &&
                mesh.userData?.isInteractable === true &&
                mesh.visible !== false
            );

        let closestHit: TargetInfo | null = null;
        const intersects = this.raycaster.intersectObjects(meshesToCheck, true);

        if (intersects.length > 0) {
             for (const intersect of intersects) {
                let hitObject: THREE.Object3D | null = intersect.object;
                let rootInstance: any = null;
                let rootMesh: THREE.Object3D | null = null;

                while (hitObject) {
                    if (hitObject.userData?.isInteractable && hitObject.userData?.entityReference) {
                        rootInstance = hitObject.userData.entityReference;
                        rootMesh = hitObject;
                        break;
                    }
                    if (hitObject.userData?.isInteractable && hitObject.userData?.isSimpleObject) {
                        rootInstance = this.interactableEntities.find(e => (e as any).mesh === hitObject);
                        if (!rootInstance) rootInstance = hitObject.userData?.entityReference;
                        rootMesh = hitObject;
                        break;
                    }
                     if (hitObject.userData?.isInteractable && hitObject === intersect.object) {
                         rootInstance = this.interactableEntities.find(e => e === hitObject);
                         if (!rootInstance) rootInstance = hitObject.userData?.entityReference;
                         rootMesh = hitObject;
                         break;
                     }
                    hitObject = hitObject.parent;
                }

                if (rootInstance && rootMesh && rootInstance.userData?.isInteractable) {
                    _objDir.copy(intersect.point).sub(this.camera.position).normalize();
                    this.camera.getWorldDirection(_camDir);
                    const angle = _camDir.angleTo(_objDir);

                    if (angle < this.aimTolerance) {
                        closestHit = {
                            mesh: rootMesh, instance: rootInstance,
                            point: intersect.point, distance: intersect.distance
                        };
                        break;
                    }
                }
             }
        }

        if (closestHit) return closestHit;

        const nearby = this.findNearbyInteractable();
        if (nearby) {
             const mesh = (nearby as any).mesh ?? (nearby instanceof THREE.Object3D ? nearby : null);
             if (mesh) {
                 mesh.getWorldPosition(_objPos);
                 return {
                     mesh: mesh, instance: nearby, point: _objPos.clone(),
                     distance: this.player.mesh.position.distanceTo(_objPos)
                 };
             }
        }

        return null;
    }

    private findNearbyInteractable(): Entity | InteractableObject | THREE.Object3D | null {
        this.player.mesh.getWorldPosition(_playerPos);
        let closestDistSq = this.interactionDistance * this.interactionDistance;
        let closestInstance: Entity | InteractableObject | THREE.Object3D | null = null;

        this.interactableEntities.forEach(item => {
            if (!item?.userData?.isInteractable || item === this.player.mesh) return;
             if (item.userData?.isSimpleObject && !(item as InteractableObject).isActive) return;

             const objMesh = (item as any).mesh ?? (item instanceof THREE.Object3D ? item : null);
             if (!objMesh || objMesh.visible === false) return;

             objMesh.getWorldPosition(_objPos);
             const distSq = _playerPos.distanceToSquared(_objPos);

             if (distSq < closestDistSq) {
                 this.player.mesh.getWorldDirection(_playerDir);
                 _objDir.copy(_objPos).sub(_playerPos).normalize();
                 const angle = _playerDir.angleTo(_objDir);

                 if (angle < Math.PI / 2.5) {
                     closestDistSq = distSq;
                     closestInstance = item;
                 }
             }
        });
        return closestInstance;
    }

    private tryInteract(targetInstance: any, targetMesh: THREE.Object3D | null): void {
        if (!targetInstance || !targetMesh || !targetInstance.userData?.isInteractable) {
            console.warn("Attempted interaction with invalid target:", targetInstance);
            return;
        }

        const distance = this.player.mesh.position.distanceTo(targetMesh.position);
        if (distance > this.interactionDistance * 1.1) {
            console.log("Target too far away.");
            this.currentTarget = null; this.currentTargetMesh = null;
            this.hidePrompt();
            return;
        }

        const interactionType = targetInstance.userData.interactionType as string;
        const targetName = targetInstance.name ?? targetInstance.id ?? 'object';
        console.log(`Attempting interaction: ${interactionType} with ${targetName}`);

        let result: InteractionResult | null = null;

        if (typeof targetInstance.interact === 'function') {
            result = targetInstance.interact(this.player, this.inventory, this.eventLog);
        }
        else if (interactionType === 'gather' && targetInstance.userData.resource) {
            this.startGatherAction(targetInstance);
            result = { type: 'gather_start' };
        } else if (interactionType === 'open' && targetInstance.userData.loot) {
             result = this.handleOpenAction(targetInstance);
        } else {
            console.warn(`Unknown interaction type or missing interact method for ${targetName}:`, interactionType);
            result = { type: 'message', message: "You look at the object." };
        }

        if (result) {
            this.handleInteractionResult(result, targetInstance);
        }

        if (result?.type !== 'gather_start' && !targetInstance.userData?.isInteractable) {
            this.currentTarget = null;
            this.currentTargetMesh = null;
        }
    }

    private handleInteractionResult(result: InteractionResult, targetInstance: any): void {
        let promptDuration: number | null = 2000;
        let promptText: string | null = null;

        switch (result.type) {
            case 'reward':
                if (result.item) {
                    if (this.inventory.addItem(result.item.name, result.item.amount)) {
                        const msg = result.message || `Received ${result.item.amount} ${result.item.name}.`;
                        this.eventLog?.addEntry(msg); promptText = msg; promptDuration = 3000;
                    } else {
                        const failMsg = `Found ${result.item.name}, but inventory is full!`;
                        this.eventLog?.addEntry(failMsg); promptText = failMsg; promptDuration = 3000;
                    }
                } else if (result.message) {
                     this.eventLog?.addEntry(result.message); promptText = result.message; promptDuration = 3000;
                }
                break;
            case 'message':
                if (result.message) {
                    this.eventLog?.addEntry(result.message); promptText = result.message;
                }
                break;
            case 'dialogue':
                if (result.text) {
                    const npcName = targetInstance?.name ?? 'NPC';
                    promptText = `${npcName}: ${result.text}`; promptDuration = 4000;
                }
                break;
            case 'item_retrieved':
                 promptDuration = null;
                break;
            case 'open_result':
                 if (result.message) promptText = result.message; promptDuration = 3000;
                 break;
            case 'error':
                if (result.message) {
                    this.eventLog?.addEntry(`Error: ${result.message}`); promptText = result.message;
                }
                break;
            case 'gather_start':
                 promptDuration = null;
                 break;
            default:
                console.log("Unhandled interaction result type:", result.type);
                break;
        }

        if (promptText) {
            this.showPrompt(promptText, promptDuration);
        }
    }

    private startGatherAction(targetInstance: any): void {
        if (this.activeGather) return;

        const resource = targetInstance.userData.resource as string;
        const gatherTime = (targetInstance.userData.gatherTime as number) || 2000;

        this.activeGather = {
            targetInstance: targetInstance, startTime: performance.now(),
            duration: gatherTime, resource: resource
        };

        this.showPrompt(`Gathering ${resource}... (0%)`);
        console.log(`Started gathering ${resource}`);
        this.eventLog?.addEntry(`Started gathering ${resource}...`);

        this.player.velocity.x = 0;
        this.player.velocity.z = 0;
    }

    private updateGatherAction(deltaTime: number): void {
        if (!this.activeGather) return;

        const elapsedTime = performance.now() - this.activeGather.startTime;
        const progress = Math.min(1, elapsedTime / this.activeGather.duration);

        this.showPrompt(`Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`);

        if (progress >= 1) {
            this.completeGatherAction();
        }
    }

    private completeGatherAction(): void {
        if (!this.activeGather) return;
        const { resource, targetInstance } = this.activeGather;
        console.log(`Finished gathering ${resource}`);

        if (this.inventory.addItem(resource, 1)) {
            this.eventLog?.addEntry(`Gathered 1 ${resource}.`);

            if (targetInstance.userData.isDepletable) {
                targetInstance.userData.isInteractable = false;
                if (targetInstance.mesh) targetInstance.mesh.visible = false;
                const respawnTime = targetInstance.userData.respawnTime || 15000;
                setTimeout(() => {
                    if (targetInstance?.userData && targetInstance.mesh) {
                        targetInstance.userData.isInteractable = true;
                        targetInstance.mesh.visible = true;
                        console.log(`${resource} node respawned.`);
                    }
                }, respawnTime);
            } else if (targetInstance.userData.isSimpleObject && typeof targetInstance.removeFromWorld === 'function') {
                targetInstance.removeFromWorld();
            }

        } else {
            this.eventLog?.addEntry(`Inventory full, could not gather ${resource}.`);
        }

        this.activeGather = null;
        this.hidePrompt();
        this.currentTarget = null;
        this.currentTargetMesh = null;
    }

    private cancelGatherAction(): void {
        if (!this.activeGather) return;
        const resource = this.activeGather.resource;
        console.log(`Gathering ${resource} cancelled.`);
        this.eventLog?.addEntry(`Gathering ${resource} cancelled.`);
        this.activeGather = null;
        this.hidePrompt();
    }

     private handleOpenAction(targetInstance: any): InteractionResult | null {
         if (!targetInstance || !targetInstance.userData || typeof targetInstance.open !== 'function') {
             console.warn("Invalid target for open action.");
             return { type: 'error', message: "Cannot open this." };
         }

         if (targetInstance.userData.isOpen) {
              console.log("Chest is already open.");
              this.eventLog?.addEntry("The chest is empty.");
              return { type: 'message', message: "The chest is empty." };
         }

         console.log("Opening chest...");
         this.eventLog?.addEntry("You open the chest...");

         if (!targetInstance.open()) {
            return { type: 'error', message: "Cannot open chest right now." };
         }

         const loot = targetInstance.userData.loot as Record<string, number> | undefined;
         let lootMessages: string[] = [];
         let itemsFound = false;

         if (loot) {
             Object.entries(loot).forEach(([itemName, amount]) => {
                 if (amount > 0 && this.inventory.addItem(itemName, amount)) {
                     lootMessages.push(`Found ${amount} ${itemName}`);
                     itemsFound = true;
                 } else if (amount > 0) {
                     lootMessages.push(`Found ${amount} ${itemName}, but inventory is full!`);
                     itemsFound = true;
                 }
             });
             targetInstance.userData.loot = {};
         }

         const finalMessage = itemsFound ? lootMessages.join('. ') : "The chest is empty.";
         this.eventLog?.addEntry(finalMessage + ".");

         return { type: 'open_result', message: finalMessage };
     }


    private showPrompt(text: string, duration: number | null = null): void {
        if (!this.interactionPromptElement) return;
        if (this.activeGather && duration === null) return;

        this.interactionPromptElement.textContent = text;
        this.interactionPromptElement.style.display = 'block';

        clearTimeout(this.promptTimeout ?? undefined);
        this.promptTimeout = null;

        if (duration && duration > 0) {
            this.promptTimeout = setTimeout(() => {
                if (this.interactionPromptElement?.textContent === text) {
                    this.hidePrompt();
                }
            }, duration);
        }
    }

    private hidePrompt(): void {
        if (!this.interactionPromptElement) return;
        if (!this.activeGather && !this.promptTimeout) {
            this.interactionPromptElement.style.display = 'none';
            this.interactionPromptElement.textContent = '';
        }
    }
}


const _overlap = new THREE.Vector3();
const _centerPlayer = new THREE.Vector3();
const _centerObject = new THREE.Vector3();
const _sizePlayer = new THREE.Vector3();
const _sizeObject = new THREE.Vector3();
const _pushVector = new THREE.Vector3();
const _tempBoxPhysics = new THREE.Box3();
const _objectPosPhysics = new THREE.Vector3();

export class Physics {
    private player: Player;
    private collidableObjects: THREE.Object3D[];
    private collisionCheckRadiusSq: number = 20 * 20;

    constructor(player: Player, collidableObjects: THREE.Object3D[]) {
        this.player = player;
        this.collidableObjects = collidableObjects;
    }

    update(deltaTime: number): void {
        this.handleCollisions(deltaTime);
    }

    private handleCollisions(deltaTime: number): void {
        if (this.player.isDead) return;

        const playerBox = this.player.userData.boundingBox;
        if (!playerBox || playerBox.isEmpty()) {
            this.player.updateBoundingBox();
             if (!this.player.userData.boundingBox || this.player.userData.boundingBox.isEmpty()) {
                 console.error("Cannot perform physics update without player bounding box.");
                 return;
             }
        }

        const playerPos = this.player.mesh.position;

        this.collidableObjects.forEach(object => {
            if (!object || object === this.player.mesh || !object.userData?.isCollidable || object.userData?.isTerrain || !object.parent) {
                return;
            }
            if (object.userData?.entityReference?.isDead) {
                return;
            }

            object.getWorldPosition(_objectPosPhysics);
            if (playerPos.distanceToSquared(_objectPosPhysics) > this.collisionCheckRadiusSq) {
                return;
            }

            let objectBox = object.userData.boundingBox as THREE.Box3 | undefined;

            if (!objectBox || objectBox.isEmpty()) {
                if (object instanceof THREE.Mesh && object.geometry?.boundingBox) {
                     if (object instanceof THREE.Mesh && object.geometry?.boundingBox) {
                         _tempBoxPhysics.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
                     } else {
                         return;
                     }
                } else {
                     _tempBoxPhysics.setFromObject(object, true);
                }
                objectBox = _tempBoxPhysics;
                 if (objectBox.isEmpty()) {
                    return;
                 }
            }

            if (playerBox && playerBox.intersectsBox(objectBox)) {
                this.resolveCollision(playerBox, objectBox, object);
                 this.player.updateBoundingBox();
            }
        });
    }

    private resolveCollision(playerBox: THREE.Box3, objectBox: THREE.Box3, object: THREE.Object3D): void {
        playerBox.getCenter(_centerPlayer);
        objectBox.getCenter(_centerObject);
        playerBox.getSize(_sizePlayer);
        objectBox.getSize(_sizeObject);

        _overlap.x = (_sizePlayer.x / 2 + _sizeObject.x / 2) - Math.abs(_centerPlayer.x - _centerObject.x);
        _overlap.y = (_sizePlayer.y / 2 + _sizeObject.y / 2) - Math.abs(_centerPlayer.y - _centerObject.y);
        _overlap.z = (_sizePlayer.z / 2 + _sizeObject.z / 2) - Math.abs(_centerPlayer.z - _centerObject.z);

        let minOverlap = Infinity;
        let pushAxis = -1;

        if (_overlap.x > 0 && _overlap.x < minOverlap) { minOverlap = _overlap.x; pushAxis = 0; }
        if (_overlap.y > 0 && _overlap.y < minOverlap) { minOverlap = _overlap.y; pushAxis = 1; }
        if (_overlap.z > 0 && _overlap.z < minOverlap) { minOverlap = _overlap.z; pushAxis = 2; }

        if (pushAxis === -1 || minOverlap < 0.0001) {
            return;
        }

        _pushVector.set(0, 0, 0);
        const pushMagnitude = minOverlap + 0.001;

        switch (pushAxis) {
            case 0:
                _pushVector.x = (_centerPlayer.x > _centerObject.x) ? pushMagnitude : -pushMagnitude;
                if (Math.sign(this.player.velocity.x) === Math.sign(_pushVector.x)) {
                    this.player.velocity.x = 0;
                }
                break;
            case 1:
                _pushVector.y = (_centerPlayer.y > _centerObject.y) ? pushMagnitude : -pushMagnitude;
                if (_pushVector.y > 0.01 && this.player.velocity.y <= 0) {
                    this.player.velocity.y = 0;
                    this.player.isOnGround = true;
                    this.player.canJump = true;
                }
                else if (_pushVector.y < -0.01 && this.player.velocity.y > 0) {
                    this.player.velocity.y = 0;
                }
                break;
            case 2:
                _pushVector.z = (_centerPlayer.z > _centerObject.z) ? pushMagnitude : -pushMagnitude;
                 if (Math.sign(this.player.velocity.z) === Math.sign(_pushVector.z)) {
                    this.player.velocity.z = 0;
                 }
                break;
        }

        this.player.mesh.position.add(_pushVector);
    }
}


const _targetPosition = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _idealPosition = new THREE.Vector3();
const _cameraDirection = new THREE.Vector3();
const _finalPosition = new THREE.Vector3();
const _idealLookat = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();

export class ThirdPersonCamera {
    public camera: THREE.PerspectiveCamera;
    public target: THREE.Object3D;

    public idealOffset: THREE.Vector3;
    public minOffsetDistance: number;
    public maxOffsetDistance: number;

    public pitchAngle: number;
    public minPitch: number;
    public maxPitch: number;
    private pitchSensitivity: number;

    private lerpAlphaPositionBase: number = 0.05;
    private lerpAlphaLookatBase: number = 0.1;

    private collisionRaycaster: THREE.Raycaster;
    private collisionOffset: number;

    private currentPosition: THREE.Vector3;
    private currentLookat: THREE.Vector3;

    constructor(camera: THREE.PerspectiveCamera, target: THREE.Object3D) {
        if (!camera || !target) {
            throw new Error("Camera and target mesh are required for ThirdPersonCamera.");
        }
        this.camera = camera;
        this.target = target;

        this.idealOffset = new THREE.Vector3(0, 2.5, 5.0);
        this.minOffsetDistance = 1.5;
        this.maxOffsetDistance = 12.0;

        this.pitchAngle = 0.15;
        this.minPitch = -Math.PI / 3;
        this.maxPitch = Math.PI / 2.5;
        this.pitchSensitivity = 0.0025;

        this.collisionRaycaster = new THREE.Raycaster();
        this.collisionOffset = 0.3;

        this.currentPosition = new THREE.Vector3();
        this.currentLookat = new THREE.Vector3();
        this.target.getWorldPosition(this.currentLookat);
        this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6;
        this.update(0.016, []);
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }

    public handleMouseInput(deltaX: number, deltaY: number): void {
        this.pitchAngle -= deltaY * this.pitchSensitivity;
        this.pitchAngle = THREE.MathUtils.clamp(this.pitchAngle, this.minPitch, this.maxPitch);
    }

    public update(deltaTime: number, collidables: THREE.Object3D[] = []): void {
        if (!this.target) return;

        this.target.getWorldPosition(_targetPosition);
        const targetQuaternion = this.target.quaternion;

        _offset.copy(this.idealOffset)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), this.pitchAngle)
            .applyQuaternion(targetQuaternion);

        _idealPosition.copy(_targetPosition).add(_offset);

        _cameraDirection.copy(_idealPosition).sub(_targetPosition);
        let idealDistance = _cameraDirection.length();
        _cameraDirection.normalize();

        _rayOrigin.copy(_targetPosition).addScaledVector(_cameraDirection, 0.2);
        this.collisionRaycaster.set(_rayOrigin, _cameraDirection);
        this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2);
        this.collisionRaycaster.near = 0;

        const collisionCheckObjects = collidables.filter(obj =>
            obj !== this.target && obj?.userData?.isCollidable
        );
        const intersects = this.collisionRaycaster.intersectObjects(collisionCheckObjects, true);

        let actualDistance = idealDistance;
        if (intersects.length > 0) {
             actualDistance = intersects.reduce((minDist, intersect) => Math.min(minDist, intersect.distance), idealDistance);
             actualDistance = actualDistance + 0.2 - this.collisionOffset;
             actualDistance = Math.max(this.minOffsetDistance, actualDistance);
        }

        actualDistance = THREE.MathUtils.clamp(actualDistance, this.minOffsetDistance, this.maxOffsetDistance);

        _finalPosition.copy(_targetPosition).addScaledVector(_cameraDirection, actualDistance);

        const targetHeight = this.target.userData?.height ?? 1.8;
        _idealLookat.copy(_targetPosition).add(new THREE.Vector3(0, targetHeight * 0.6, 0));

        smoothVectorLerp(this.currentPosition, _finalPosition, this.lerpAlphaPositionBase, deltaTime);
        smoothVectorLerp(this.currentLookat, _idealLookat, this.lerpAlphaLookatBase, deltaTime);

        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookat);
    }
}


type KeyCallback = () => void;
type MouseCallback = (event: MouseEvent) => void;

export class Controls {
    public player: Player | null;
    public cameraController: ThirdPersonCamera | null;
    public domElement: HTMLElement;

    public keys: KeyState = {};
    public mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
    public isPointerLocked: boolean = false;
    private playerRotationSensitivity: number = 0.0025;

    public moveState: MoveState = {
        forward: 0, right: 0, jump: false, sprint: false, interact: false
    };

    private keyDownListeners: Record<string, KeyCallback[]> = {};
    private mouseClickListeners: Record<number, MouseCallback[]> = {};

    private boundOnKeyDown: (event: KeyboardEvent) => void;
    private boundOnKeyUp: (event: KeyboardEvent) => void;
    private boundOnMouseDown: (event: MouseEvent) => void;
    private boundOnMouseUp: (event: MouseEvent) => void;
    private boundOnMouseMove: (event: MouseEvent) => void;
    private boundOnClick: (event: MouseEvent) => void;
    private boundOnPointerLockChange: () => void;
    private boundOnPointerLockError: () => void;

    constructor(
        player: Player | null, cameraController: ThirdPersonCamera | null, domElement: HTMLElement | null
    ) {
        this.player = player;
        this.cameraController = cameraController;
        this.domElement = domElement ?? document.body;

        this.boundOnKeyDown = this.onKeyDown.bind(this);
        this.boundOnKeyUp = this.onKeyUp.bind(this);
        this.boundOnMouseDown = this.onMouseDown.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnClick = this.onClick.bind(this);
        this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
        this.boundOnPointerLockError = this.onPointerLockError.bind(this);

        this.initListeners();
    }

    private initListeners(): void {
        document.addEventListener('keydown', this.boundOnKeyDown, false);
        document.addEventListener('keyup', this.boundOnKeyUp, false);
        document.addEventListener('mousedown', this.boundOnMouseDown, false);
        document.addEventListener('mouseup', this.boundOnMouseUp, false);
        document.addEventListener('mousemove', this.boundOnMouseMove, false);
        this.domElement.addEventListener('click', this.boundOnClick, false);
        document.addEventListener('pointerlockchange', this.boundOnPointerLockChange, false);
        document.addEventListener('pointerlockerror', this.boundOnPointerLockError, false);
    }

    public addKeyDownListener(keyCode: string, callback: KeyCallback): void {
        if (!this.keyDownListeners[keyCode]) {
            this.keyDownListeners[keyCode] = [];
        }
        this.keyDownListeners[keyCode].push(callback);
    }

    public addMouseClickListener(buttonIndex: number, callback: MouseCallback): void {
        if (!this.mouseClickListeners[buttonIndex]) {
            this.mouseClickListeners[buttonIndex] = [];
        }
        this.mouseClickListeners[buttonIndex].push(callback);
    }

    public lockPointer(): void {
        if ('requestPointerLock' in this.domElement && document.pointerLockElement !== this.domElement) {
            this.domElement.requestPointerLock().catch(err => {
                console.error("Pointer lock request failed:", err);
            });
        }
    }

    public unlockPointer(): void {
        if (document.pointerLockElement === this.domElement) {
            document.exitPointerLock();
        }
    }

    private onKeyDown(event: KeyboardEvent): void {
        const keyCode = event.code;
        if (this.keys[keyCode]) return;

        this.keys[keyCode] = true;
        this.keyDownListeners[keyCode]?.forEach(cb => cb());

        if (keyCode === 'Space') this.moveState.jump = true;
        if (keyCode === 'KeyE') this.moveState.interact = true;

        this.updateContinuousMoveState();
    }

    private onKeyUp(event: KeyboardEvent): void {
        const keyCode = event.code;
        this.keys[keyCode] = false;
        this.updateContinuousMoveState();
    }

    private onMouseDown(event: MouseEvent): void {
        this.mouse.buttons[event.button] = true;
        this.mouseClickListeners[event.button]?.forEach(cb => cb(event));
    }

    private onMouseUp(event: MouseEvent): void {
        this.mouse.buttons[event.button] = false;
    }

    private onMouseMove(event: MouseEvent): void {
        if (this.isPointerLocked) {
            this.mouse.dx += event.movementX ?? 0;
            this.mouse.dy += event.movementY ?? 0;
        } else {
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        }
    }

    private onClick(event: MouseEvent): void {
        const gameIsPaused = (window as any).game?.isPaused ?? false;
        if (!this.isPointerLocked && !gameIsPaused) {
            this.lockPointer();
        }
    }

    private onPointerLockChange(): void {
        if (document.pointerLockElement === this.domElement) {
            this.isPointerLocked = true;
            this.mouse.dx = 0;
            this.mouse.dy = 0;
        } else {
            this.isPointerLocked = false;
            this.keys = {};
            this.mouse.buttons = {};
            this.mouse.dx = 0;
            this.mouse.dy = 0;
            this.updateContinuousMoveState();
        }
    }

    private onPointerLockError(): void {
        console.error('Pointer Lock Error.');
        this.isPointerLocked = false;
    }

    private updateContinuousMoveState(): void {
        const W = this.keys['KeyW'] || this.keys['ArrowUp'];
        const S = this.keys['KeyS'] || this.keys['ArrowDown'];
        const D = this.keys['KeyD'] || this.keys['ArrowRight'];
        const A = this.keys['KeyA'] || this.keys['ArrowLeft'];
        const Sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];

        this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0);
        this.moveState.right = (D ? 1 : 0) - (A ? 1 : 0);
        this.moveState.sprint = Sprint ?? false;
    }

    public update(deltaTime: number): void {
        if (!this.isPointerLocked) {
            this.mouse.dx = 0;
            this.mouse.dy = 0;
            return;
        }

        if (this.player && Math.abs(this.mouse.dx) > 0) {
            const yawDelta = -this.mouse.dx * this.playerRotationSensitivity;
            this.player.mesh.rotateY(yawDelta);
        }

        if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
            this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy);
        }

        this.mouse.dx = 0;
        this.mouse.dy = 0;
    }

    public consumeInteraction(): boolean {
        if (this.moveState.interact) {
            this.moveState.interact = false;
            return true;
        }
        return false;
    }

    public consumeJump(): boolean {
        if (this.moveState.jump) {
            this.moveState.jump = false;
            return true;
        }
        return false;
    }

    public dispose(): void {
        document.removeEventListener('keydown', this.boundOnKeyDown);
        document.removeEventListener('keyup', this.boundOnKeyUp);
        document.removeEventListener('mousedown', this.boundOnMouseDown);
        document.removeEventListener('mouseup', this.boundOnMouseUp);
        document.removeEventListener('mousemove', this.boundOnMouseMove);
        this.domElement.removeEventListener('click', this.boundOnClick);
        document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
        document.removeEventListener('pointerlockerror', this.boundOnPointerLockError);
        this.unlockPointer();
        console.log("Controls disposed.");
    }
}


const simplexTerrain = new SimplexNoise();

export function createTerrain(size: number, segments: number = 150): THREE.Mesh {
    console.log(`Creating terrain: ${size}x${size} with ${segments}x${segments} segments.`);
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

    applyNoiseToGeometry(geometry);

    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const material = new THREE.MeshLambertMaterial({ color: 0x88B04B });

    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true;
    terrainMesh.name = "Terrain";

    terrainMesh.userData = {
        isTerrain: true, isCollidable: true, worldSize: size, segments: segments,
    };

    console.log("Terrain mesh created.");
    return terrainMesh;
}

function applyNoiseToGeometry(geometry: THREE.PlaneGeometry): void {
    const vertices = geometry.attributes.position.array as Float32Array;
    const numVertices = geometry.attributes.position.count;

    const noiseStrength = 24;
    const noiseScale = 0.005;

    const flattenRadius = 120;
    const flattenStrength = 0.05;


    for (let i = 0; i < numVertices; i++) {
        const index = i * 3;
        const x = vertices[index];
        const y = vertices[index + 1];
        let z = 0;

        z += simplexTerrain.noise(x * noiseScale, y * noiseScale) * noiseStrength;

        const distanceToCenter = Math.sqrt(x * x + y * y);
        if (distanceToCenter < flattenRadius) {
            const flattenFactor = 1.0 - smoothstep(0, flattenRadius, distanceToCenter);
            z = THREE.MathUtils.lerp(z, z * (1.0-flattenStrength), flattenFactor);
        }

        vertices[index + 2] = z;
    }

    geometry.attributes.position.needsUpdate = true;
}


export function setupLighting(scene: THREE.Scene): void {
    const ambientLight = new THREE.AmbientLight(0xadc1d4, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xfff5e1, 0.9);
    directionalLight.position.set(150, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.target.position.set(0, 0, 0);

    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 500;
    const shadowCamSize = 150;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.bias = -0.001;

    scene.add(directionalLight);
    scene.add(directionalLight.target);

    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x98FB98, 0.3);
    scene.add(hemisphereLight);

    console.log("Lighting setup complete.");
}


const treeTrunkMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new THREE.MeshLambertMaterial({ color: Colors.FOREST_GREEN });
const cabinWallMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const cabinRoofMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_ROOF });
const windmillBaseMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const windmillBladeMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const chestMat = new THREE.MeshLambertMaterial({ color: Colors.SADDLE_BROWN });
const bowMat = new THREE.MeshLambertMaterial({ color: Colors.SIENNA });


function createTree(position: THREE.Vector3): THREE.Group {
    const trunkHeight = randomFloat(3, 5);
    const trunkRadius = randomFloat(0.3, 0.5);
    const foliageHeight = trunkHeight * 1.2 + randomFloat(0, 1);
    const foliageRadius = trunkRadius * 3 + randomFloat(0, 1.5);

    const treeGroup = new THREE.Group();
    treeGroup.name = "Tree";

    const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8);
    const trunkMesh = new THREE.Mesh(trunkGeo, treeTrunkMat);
    trunkMesh.position.y = trunkHeight / 2;
    trunkMesh.castShadow = true; trunkMesh.receiveShadow = true;
    treeGroup.add(trunkMesh);

    const foliageGeo = new THREE.ConeGeometry(foliageRadius, foliageHeight, 6);
    const foliageMesh = new THREE.Mesh(foliageGeo, treeFoliageMat);
    foliageMesh.position.y = trunkHeight + foliageHeight / 3;
    foliageMesh.castShadow = true;
    treeGroup.add(foliageMesh);

    treeGroup.position.copy(position).setY(0);

    treeGroup.userData = {
        ...treeGroup.userData,
        isCollidable: true, isInteractable: true, interactionType: 'gather',
        resource: 'wood', gatherTime: 3000, prompt: "Press E to gather Wood",
        isDepletable: true, respawnTime: 20000,
        entityReference: treeGroup, boundingBox: new THREE.Box3().setFromObject(treeGroup)
    };

    return treeGroup;
}

function createRock(position: THREE.Vector3, size: number): THREE.Group {
    const rockGroup = new THREE.Group();
    rockGroup.name = "Rock";
    const height = size * randomFloat(0.5, 1.0);
    const geo = new THREE.BoxGeometry(size, height, size * randomFloat(0.8, 1.2));
    const mesh = new THREE.Mesh(geo, rockMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.rotation.set( randomFloat(-0.1, 0.1) * Math.PI, randomFloat(0, 2) * Math.PI, randomFloat(-0.1, 0.1) * Math.PI );
    rockGroup.add(mesh);
    rockGroup.position.copy(position).setY(0);

    rockGroup.userData = {
        ...rockGroup.userData,
        isCollidable: true, isInteractable: true, interactionType: 'gather',
        resource: 'stone', gatherTime: 4000, prompt: "Press E to gather Stone",
        isDepletable: true, respawnTime: 30000,
        entityReference: rockGroup, boundingBox: new THREE.Box3().setFromObject(rockGroup)
    };
    return rockGroup;
}


function createHerb(position: THREE.Vector3): THREE.Group {
    const herbGroup = new THREE.Group();
    herbGroup.name = "Herb Plant";
    const size = 0.25;
    const geo = new THREE.SphereGeometry(size, 5, 4);
    const mesh = new THREE.Mesh(geo, herbMat);
    mesh.castShadow = true;
    herbGroup.add(mesh);
    herbGroup.position.copy(position).setY(size);

    herbGroup.userData = {
        ...herbGroup.userData,
        isCollidable: false, isInteractable: true, interactionType: 'gather',
        resource: 'herb', gatherTime: 1500, prompt: "Press E to gather Herb",
        isDepletable: true, respawnTime: 15000,
        entityReference: herbGroup, boundingBox: new THREE.Box3().setFromObject(herbGroup)
    };
    return herbGroup;
}

function createCabin(position: THREE.Vector3, rotationY: number = 0): THREE.Group {
    const cabinGroup = new THREE.Group();
    cabinGroup.name = "Cabin";
    const wallHeight = 3, wallWidth = 5, wallDepth = 4;

    const wallGeo = new THREE.BoxGeometry(wallWidth, wallHeight, wallDepth);
    const wallMesh = new THREE.Mesh(wallGeo, cabinWallMat);
    wallMesh.position.y = wallHeight / 2;
    wallMesh.castShadow = true; wallMesh.receiveShadow = true;
    cabinGroup.add(wallMesh);

    const roofHeight = 1.5;
    const roofGeo = new THREE.ConeGeometry(Math.max(wallWidth, wallDepth) * 0.7, roofHeight, 4);
    const roofMesh = new THREE.Mesh(roofGeo, cabinRoofMat);
    roofMesh.position.y = wallHeight + roofHeight / 2;
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.castShadow = true;
    cabinGroup.add(roofMesh);

    cabinGroup.position.copy(position).setY(0);
    cabinGroup.rotation.y = rotationY;

    cabinGroup.userData = {
        ...cabinGroup.userData,
        isCollidable: true, isInteractable: false, entityReference: cabinGroup,
        boundingBox: new THREE.Box3().setFromObject(cabinGroup).expandByScalar(0.05)
    };
    return cabinGroup;
}

class Windmill extends THREE.Group {
    public bladeAssembly: THREE.Group;

    constructor(position: THREE.Vector3) {
        super();
        this.name = "Windmill";
        const baseHeight = 8, baseRadiusTop = 1.5, baseRadiusBottom = 2.5;
        const bladeLength = 5, bladeWidth = 0.5, bladeDepth = 0.1;

        const baseGeo = new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBottom, baseHeight, 12);
        const baseMesh = new THREE.Mesh(baseGeo, windmillBaseMat);
        baseMesh.position.y = baseHeight / 2;
        baseMesh.castShadow = true; baseMesh.receiveShadow = true;
        this.add(baseMesh);

        this.bladeAssembly = new THREE.Group();
        this.bladeAssembly.position.set(0, baseHeight, baseRadiusTop * 0.8);
        this.add(this.bladeAssembly);

        for (let i = 0; i < 4; i++) {
            const bladeGeo = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeDepth);
            bladeGeo.translate(0, bladeLength / 2, 0);
            const bladeMesh = new THREE.Mesh(bladeGeo, windmillBladeMat);
            bladeMesh.castShadow = true;
            bladeMesh.rotation.z = (i * Math.PI) / 2;
            this.bladeAssembly.add(bladeMesh);
        }

        this.position.copy(position).setY(0);

        this.userData = {
            isCollidable: true, isInteractable: false, entityReference: this,
            boundingBox: new THREE.Box3().setFromObject(baseMesh).expandByScalar(0.1)
        };
    }

    public update(deltaTime: number): void {
        this.bladeAssembly.rotation.z += 0.5 * deltaTime;
    }
}

class Chest extends THREE.Group {
    public lid: THREE.Group;
    private isOpen: boolean;
    private openAngle: number;
    private closedAngle: number;
    private targetAngle: number;
    private isAnimating: boolean;
    public loot: Record<string, number>;

    constructor(position: THREE.Vector3, lootData: Record<string, number> = { gold: 10 }) {
        super();
        this.name = "Chest";
        const baseSize = 0.8, lidHeight = 0.2, baseHeight = baseSize * 0.6;

        const baseGeo = new THREE.BoxGeometry(baseSize, baseHeight, baseSize * 0.5);
        const baseMesh = new THREE.Mesh(baseGeo, chestMat);
        baseMesh.position.y = baseHeight / 2;
        baseMesh.castShadow = true; baseMesh.receiveShadow = true;
        this.add(baseMesh);

        this.lid = new THREE.Group();
        this.lid.position.set(0, baseHeight, -baseSize * 0.25);
        this.add(this.lid);

        const lidGeo = new THREE.BoxGeometry(baseSize, lidHeight, baseSize * 0.5);
        const lidMesh = new THREE.Mesh(lidGeo, chestMat);
        lidMesh.position.y = lidHeight / 2;
        lidMesh.castShadow = true;
        this.lid.add(lidMesh);

        this.isOpen = false;
        this.openAngle = -Math.PI / 1.5;
        this.closedAngle = 0;
        this.targetAngle = 0;
        this.isAnimating = false;
        this.loot = { ...lootData };

        this.position.copy(position).setY(0);

        this.userData = {
            isCollidable: true, isInteractable: true, interactionType: 'open',
            prompt: "Press E to open Chest", entityReference: this,
            boundingBox: new THREE.Box3().setFromObject(this), isOpen: this.isOpen, loot: this.loot
        };
    }

    public update(deltaTime: number): void {
        if (!this.isAnimating) return;
        const lerpFactor = 1.0 - Math.pow(0.05, deltaTime);
        this.lid.rotation.x = THREE.MathUtils.lerp(this.lid.rotation.x, this.targetAngle, lerpFactor);

        if (Math.abs(this.lid.rotation.x - this.targetAngle) < 0.01) {
            this.lid.rotation.x = this.targetAngle;
            this.isAnimating = false;
        }
    }

    public open(): boolean {
        if (this.isOpen || this.isAnimating) return false;
        this.isOpen = true;
        this.targetAngle = this.openAngle;
        this.isAnimating = true;
        this.userData.isOpen = true;
        this.userData.isInteractable = false;
        this.userData.prompt = "Empty Chest";
        return true;
    }

    public close(): void {
        if (!this.isOpen || this.isAnimating) return;
        this.isOpen = false;
        this.targetAngle = this.closedAngle;
        this.isAnimating = true;
        this.userData.isOpen = false;
    }
}


export function populateEnvironment(
    scene: THREE.Scene, worldSize: number, collidableObjects: THREE.Object3D[],
    interactableObjects: Array<Entity | InteractableObject | THREE.Object3D>,
    entities: Array<Entity | THREE.Object3D>,
    inventory: Inventory, eventLog: EventLog
): void {
    const halfSize = worldSize / 2;
    const terrain = scene.getObjectByName("Terrain") as THREE.Mesh | undefined;

    const getTerrainHeight = (x: number, z: number): number => {
        if (!terrain?.geometry) return 0;
        const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObject(terrain);
        return intersects.length > 0 ? intersects[0].point.y : 0;
    };

    const villageCenter = new THREE.Vector3(5, 0, 10);
    const cabinPositions = [
        villageCenter.clone().add(new THREE.Vector3(-10, 0, 0)),
        villageCenter.clone().add(new THREE.Vector3(8, 0, -5)),
        villageCenter.clone().add(new THREE.Vector3(-5, 0, 10)),
    ];
    const cabinRotations = [Math.PI / 16, -Math.PI / 8, Math.PI / 2];

    cabinPositions.forEach((pos, i) => {
        const cabin = createCabin(pos, cabinRotations[i]);
        cabin.position.y = getTerrainHeight(pos.x, pos.z);
        scene.add(cabin);
        collidableObjects.push(cabin);
    });

    const addNpc = (pos: THREE.Vector3, name: string, accessory: 'none' | 'straw_hat' | 'cap'): NPC => {
        const npc = new NPC(scene, pos, name, accessory, inventory);
        npc.mesh.position.y = getTerrainHeight(pos.x, pos.z);
        entities.push(npc);
        collidableObjects.push(npc.mesh);
        interactableObjects.push(npc);
        return npc;
    };
    const farmer = addNpc(villageCenter.clone().add(new THREE.Vector3(-12, 0, 2)), 'Farmer Giles', 'straw_hat');
    const blacksmith = addNpc(villageCenter.clone().add(new THREE.Vector3(10, 0, -3)), 'Blacksmith Brynn', 'cap');
    const hunter = addNpc(new THREE.Vector3(halfSize * 0.4, 0, -halfSize * 0.3), 'Hunter Rex', 'none');


    const addObject = (creator: (pos: THREE.Vector3, ...args: any[]) => THREE.Group, count: number, minDistSq: number, ...args: any[]) => {
        for (let i = 0; i < count; i++) {
            const x = randomFloat(-halfSize * 0.95, halfSize * 0.95);
            const z = randomFloat(-halfSize * 0.95, halfSize * 0.95);
            const distSq = (x - villageCenter.x)**2 + (z - villageCenter.z)**2;
            if (distSq < minDistSq) continue;

            const obj = creator(new THREE.Vector3(x, 0, z), ...args);
             const height = getTerrainHeight(x, z);
             obj.position.y = height;
             if (obj.name === "Herb Plant") obj.position.y = height + 0.1;

            scene.add(obj);
            if (obj.userData.isCollidable) collidableObjects.push(obj);
            if (obj.userData.isInteractable) interactableObjects.push(obj);
        }
    };

    addObject(createTree, 150, 25 * 25);
    addObject(createRock, 80, 20 * 20, randomFloat(1, 2.5));
    addObject(createHerb, 60, 10 * 10);

    const windmillPos = new THREE.Vector3(-halfSize * 0.6, 0, -halfSize * 0.2);
    const windmill = new Windmill(windmillPos);
    windmill.position.y = getTerrainHeight(windmillPos.x, windmillPos.z);
    scene.add(windmill);
    collidableObjects.push(windmill);
    entities.push(windmill);

    const caveAreaCenter = new THREE.Vector3(halfSize * 0.7, 0, halfSize * 0.6);
    const bowPos = caveAreaCenter.clone().add(new THREE.Vector3(3, 0, 2));
    bowPos.y = getTerrainHeight(bowPos.x, bowPos.z) + 0.1;
    const huntersBowItem = new InteractableObject(
        'hunters_bow_item', bowPos, 'retrieve', 'Hunter\'s Bow', 'Press E to pick up Bow', scene
    );
    const bowGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1);
    huntersBowItem.mesh = new THREE.Mesh(bowGeo, bowMat);
    huntersBowItem.mesh.position.copy(huntersBowItem.position).add(new THREE.Vector3(0, 0.6, 0));
    huntersBowItem.mesh.rotation.z = Math.PI / 2.5;
    huntersBowItem.mesh.rotation.x = Math.PI / 8;
    huntersBowItem.mesh.castShadow = true;
    huntersBowItem.mesh.userData = huntersBowItem.userData;
    scene.add(huntersBowItem.mesh);
    interactableObjects.push(huntersBowItem);

    const addChest = (pos: THREE.Vector3, loot: Record<string, number>) => {
        const chest = new Chest(pos, loot);
        chest.position.y = getTerrainHeight(pos.x, pos.z);
        scene.add(chest);
        collidableObjects.push(chest);
        interactableObjects.push(chest);
        entities.push(chest);
    };
    addChest(villageCenter.clone().add(new THREE.Vector3(3, 0, 15)), { gold: 15, 'Health Potion': 1 });
    addChest(new THREE.Vector3(halfSize * 0.6 + 5, 0, -halfSize * 0.6 + 15), { wood: 5, stone: 3, herb: 2 });


    console.log("Environment populated.");
    console.log("Total Collidables:", collidableObjects.length);
    console.log("Total Interactables:", interactableObjects.length);
    console.log("Total Entities:", entities.length);
}


export function createWorldBoundary(scene: THREE.Scene, worldSize: number, collidableObjects: THREE.Object3D[]): void {
    const thickness = 20;
    const height = 100;
    const halfSize = worldSize / 2;

    const boundaryMaterial = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.0, side: THREE.DoubleSide, visible: false
    });

    const createWall = (px: number, pz: number, sx: number, sz: number, name: string) => {
        const wallGeo = new THREE.BoxGeometry(sx, height, sz);
        const wallMesh = new THREE.Mesh(wallGeo, boundaryMaterial);
        wallMesh.position.set(px, height / 2, pz);
        wallMesh.name = name;
        wallMesh.userData.isCollidable = true;
        wallMesh.geometry.computeBoundingBox();
        wallMesh.updateMatrixWorld(true);
        wallMesh.userData.boundingBox = wallMesh.geometry.boundingBox!.clone().applyMatrix4(wallMesh.matrixWorld);
        scene.add(wallMesh);
        collidableObjects.push(wallMesh);
    };

    createWall(halfSize + thickness / 2, 0, thickness, worldSize + thickness * 2, "Boundary+X");
    createWall(-halfSize - thickness / 2, 0, thickness, worldSize + thickness * 2, "Boundary-X");
    createWall(0, halfSize + thickness / 2, worldSize + thickness * 2, thickness, "Boundary+Z");
    createWall(0, -halfSize - thickness / 2, worldSize + thickness * 2, thickness, "Boundary-Z");

    console.log("World boundaries created.");
}


export class HUD {
    private player: Player;
    private healthBarElement: HTMLElement | null;
    private staminaBarElement: HTMLElement | null;

    constructor(player: Player) {
        if (!player) throw new Error("Player instance is required for HUD.");
        this.player = player;

        this.healthBarElement = document.getElementById('health-bar');
        this.staminaBarElement = document.getElementById('stamina-bar');

        if (!this.healthBarElement) console.error("HUD element not found: #health-bar");
        if (!this.staminaBarElement) console.error("HUD element not found: #stamina-bar");

        this.update();
    }

    update(): void {
        if (this.player.isDead) {
            if (this.healthBarElement) this.healthBarElement.style.width = `0%`;
            if (this.staminaBarElement) this.staminaBarElement.style.width = `0%`;
            return;
        }

        if (!this.healthBarElement || !this.staminaBarElement) return;

        const healthPercent = Math.max(0, (this.player.health / this.player.maxHealth) * 100);
        this.healthBarElement.style.width = `${healthPercent}%`;
        if (healthPercent < 30) this.healthBarElement.style.backgroundColor = '#FF4500';
        else if (healthPercent < 60) this.healthBarElement.style.backgroundColor = '#FFA500';
        else this.healthBarElement.style.backgroundColor = '#4CAF50';

        const staminaPercent = Math.max(0, (this.player.stamina / this.player.maxStamina) * 100);
        this.staminaBarElement.style.width = `${staminaPercent}%`;
        if (this.player.isExhausted) {
            this.staminaBarElement.style.backgroundColor = '#888';
            this.staminaBarElement.classList.add('exhausted');
        } else {
            this.staminaBarElement.style.backgroundColor = '#FF69B4';
            this.staminaBarElement.classList.remove('exhausted');
        }
    }
}


export class InventoryDisplay {
    private inventory: Inventory;
    private displayElement: HTMLElement | null;
    private slotsContainer: HTMLElement | null;
    private _isOpen: boolean;

    private boundUpdateDisplay!: (items: Array<InventoryItem | null>) => void;

    constructor(inventory: Inventory) {
        if (!inventory) throw new Error("Inventory instance is required for InventoryDisplay.");
        this.inventory = inventory;
        this._isOpen = false;

        this.displayElement = document.getElementById('inventory-display');
        this.slotsContainer = document.getElementById('inventory-slots');

        if (!this.displayElement || !this.slotsContainer) {
            console.error("Inventory UI elements not found (#inventory-display or #inventory-slots). Aborting setup.");
            return;
        }

        this.createSlots();

        this.boundUpdateDisplay = this.updateDisplay.bind(this);
        this.inventory.onChange(this.boundUpdateDisplay);

        this.hide();
    }

    public get isOpen(): boolean {
        return this._isOpen;
    }

    private createSlots(): void {
        if (!this.slotsContainer) return;
        this.slotsContainer.innerHTML = '';

        for (let i = 0; i < this.inventory.size; i++) {
            const slotElement = document.createElement('div');
            slotElement.classList.add('inventory-slot');
            slotElement.dataset.index = i.toString();
            slotElement.title = 'Empty';
            slotElement.innerHTML = `
                <div class="item-icon" data-current-icon="empty" style="visibility: hidden;"></div>
                <span class="item-count"></span>
            `;
            this.slotsContainer.appendChild(slotElement);
        }
    }

    private updateDisplay(items: Array<InventoryItem | null> = this.inventory.items): void {
        if (!this._isOpen || !this.slotsContainer) return;

        let slotElements = this.slotsContainer.querySelectorAll<HTMLElement>('.inventory-slot');

        if (slotElements.length !== this.inventory.size) {
             console.warn("Inventory size mismatch vs UI slots. Recreating slots.");
             this.createSlots();
             slotElements = this.slotsContainer.querySelectorAll<HTMLElement>('.inventory-slot');
             if (slotElements.length !== this.inventory.size) {
                 console.error("Failed to recreate inventory slots correctly.");
                 return;
             }
        }

        items.forEach((item, index) => {
            const slotElement = slotElements[index];
            if (!slotElement) return;

            const iconElement = slotElement.querySelector<HTMLElement>('.item-icon');
            const countElement = slotElement.querySelector<HTMLElement>('.item-count');

            if (item && iconElement && countElement) {
                const iconClass = item.icon || 'default_icon';
                if (iconElement.dataset.currentIcon !== iconClass) {
                    iconElement.className = `item-icon ${iconClass}`;
                    iconElement.dataset.currentIcon = iconClass;
                }
                 iconElement.style.visibility = 'visible';
                 countElement.textContent = item.count > 1 ? item.count.toString() : '';
                 slotElement.title = `${item.name}${item.count > 1 ? ` (${item.count})` : ''}`;
            } else if (iconElement && countElement) {
                if (iconElement.dataset.currentIcon !== 'empty') {
                    iconElement.className = 'item-icon';
                    iconElement.style.visibility = 'hidden';
                    iconElement.dataset.currentIcon = 'empty';
                }
                countElement.textContent = '';
                slotElement.title = 'Empty';
            }
        });
    }

    public toggle(): void {
        if (this._isOpen) this.hide(); else this.show();
    }

    public show(): void {
        if (!this.displayElement || this._isOpen) return;
        this._isOpen = true;
        this.updateDisplay(this.inventory.items);
        this.displayElement.classList.remove('hidden');
        console.log("Inventory opened");
    }

    public hide(): void {
        if (!this.displayElement || !this._isOpen) return;
        this._isOpen = false;
        this.displayElement.classList.add('hidden');
        console.log("Inventory closed");
    }

    public dispose(): void {
        this.inventory.removeOnChange(this.boundUpdateDisplay);
        console.log("InventoryDisplay disposed.");
    }
}


export class JournalDisplay {
    private eventLog: EventLog;
    private displayElement: HTMLElement | null;
    private eventListElement: HTMLElement | null;
    private _isOpen: boolean;

    private boundUpdateEvents!: (entries: string[]) => void;

    constructor(eventLog: EventLog) {
        if (!eventLog) {
            throw new Error("EventLog instance is required for JournalDisplay.");
        }
        this.eventLog = eventLog;
        this._isOpen = false;

        this.displayElement = document.getElementById('journal-display');
        this.eventListElement = document.getElementById('event-log');

        if (!this.displayElement || !this.eventListElement) {
            console.error("Journal UI elements not found (#journal-display or #event-log). Aborting setup.");
            return;
        }

        this.boundUpdateEvents = this.updateEvents.bind(this);
        this.eventLog.onChange(this.boundUpdateEvents);

        this.hide();
    }

    public get isOpen(): boolean {
        return this._isOpen;
    }

    private updateDisplay(): void {
        if (!this._isOpen) return;
        this.updateEvents(this.eventLog.getFormattedEntries());
    }

    private updateEvents(entries: string[] = this.eventLog.getFormattedEntries()): void {
        if (!this._isOpen || !this.eventListElement) return;
        this.eventListElement.innerHTML = '';

        if (entries.length === 0) {
            this.eventListElement.innerHTML = '<li>No events recorded yet.</li>';
            return;
        }
        entries.forEach(entryText => {
            const li = document.createElement('li');
            li.textContent = entryText;
            this.eventListElement?.appendChild(li);
        });

        this.eventListElement.scrollTop = this.eventListElement.scrollHeight;
    }

    public toggle(): void {
        if (this._isOpen) this.hide(); else this.show();
    }

    public show(): void {
        if (!this.displayElement || this._isOpen) return;
        this._isOpen = true;
        this.updateDisplay();
        this.displayElement.classList.remove('hidden');
        console.log("Journal opened");
    }

    public hide(): void {
        if (!this.displayElement || !this._isOpen) return;
        this._isOpen = false;
        this.displayElement.classList.add('hidden');
        console.log("Journal closed");
    }

    public dispose(): void {
        this.eventLog.removeOnChange(this.boundUpdateEvents);
        console.log("JournalDisplay disposed.");
    }
}


export class Minimap {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null;
    private player: Player;
    private entities: Array<Entity | THREE.Object3D>;
    private worldSize: number;

    private mapSize: number;
    private mapScale: number;
    private halfMapSize: number;
    private halfWorldSize: number;

    private bgColor: string = 'rgba(100, 100, 100, 0.6)';
    private playerColor: string = 'yellow';
    private npcColor: string = 'cyan';
    private defaultColor: string = 'gray';

    private dotSize: number = 3;
    private playerDotSize: number = 4;
    private playerTriangleSize: number;

    private _entityPos = new THREE.Vector3();
    private _playerPos = new THREE.Vector3();

    constructor(
        canvasElement: HTMLCanvasElement | null, player: Player,
        entities: Array<Entity | THREE.Object3D>, worldSize: number
    ) {
        if (!canvasElement || !player || !entities || !worldSize) {
            throw new Error("Minimap requires canvas, player, entities array, and worldSize.");
        }
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.player = player;
        this.entities = entities;
        this.worldSize = worldSize;

        if (!this.ctx) {
             throw new Error("Failed to get 2D context from minimap canvas.");
        }

        this.mapSize = this.canvas.width;
        this.mapScale = this.mapSize / this.worldSize;
        this.halfMapSize = this.mapSize / 2;
        this.halfWorldSize = this.worldSize / 2;
        this.playerTriangleSize = this.playerDotSize * 1.5;
    }

    update(): void {
        if (!this.ctx) return;

        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

        if (this.player.isDead) return;

        this.player.mesh.getWorldPosition(this._playerPos);
        const playerRotationY = this.player.mesh.rotation.y;

        const playerMapX = this.worldToMapX(this._playerPos.x);
        const playerMapY = this.worldToMapZ(this._playerPos.z);

        this.ctx.save();
        this.ctx.translate(this.halfMapSize, this.halfMapSize);
        this.ctx.rotate(-playerRotationY);
        this.ctx.translate(-playerMapX, -playerMapY);

        this.entities.forEach(entity => {
            if (!entity || (entity instanceof Player && entity === this.player) || (entity instanceof Entity && entity.isDead)) {
                 return;
            }
             const mesh = (entity instanceof Entity) ? entity.mesh : (entity instanceof THREE.Object3D ? entity : null);
             if (!mesh || !mesh.parent || !mesh.visible) return;

             mesh.getWorldPosition(this._entityPos);
             const entityMapX = this.worldToMapX(this._entityPos.x);
             const entityMapY = this.worldToMapZ(this._entityPos.z);

             let color = this.defaultColor;
             let size = this.dotSize;
             let draw = true;

             if (entity instanceof NPC) {
                color = this.npcColor;
                size += 1;
             } else {
                 draw = false;
             }

             if (draw) {
                 this.drawDot(entityMapX, entityMapY, color, size);
             }
        });

        this.ctx.restore();

        this.drawPlayerTriangle(this.halfMapSize, this.halfMapSize, this.playerColor, this.playerTriangleSize);
    }

    private worldToMapX(worldX: number): number {
        return (worldX + this.halfWorldSize) * this.mapScale;
    }

    private worldToMapZ(worldZ: number): number {
        return (worldZ + this.halfWorldSize) * this.mapScale;
    }

    private drawDot(mapX: number, mapY: number, color: string, size: number): void {
        if (!this.ctx) return;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
        this.ctx.fill();
    }

    private drawPlayerTriangle(centerX: number, centerY: number, color: string, size: number): void {
        if (!this.ctx) return;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - size * 0.6);
        this.ctx.lineTo(centerX - size / 2, centerY + size * 0.4);
        this.ctx.lineTo(centerX + size / 2, centerY + size * 0.4);
        this.ctx.closePath();
        this.ctx.fill();
    }
}


const WORLD_SIZE = 1000;
const TERRAIN_SEGMENTS = 150;

(window as any).game = null;

function getTerrainHeightGame(x: number, z: number): number {
    const game = (window as any).game as Game | null;
    const terrain = game?.scene?.getObjectByName("Terrain") as THREE.Mesh | undefined;
    if (!terrain) return 0;

    const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(terrain);
    return intersects.length > 0 ? intersects[0].point.y : 0;
}

class Game {
    public scene: THREE.Scene | null = null;
    public renderer: THREE.WebGLRenderer | null = null;
    public camera: THREE.PerspectiveCamera | null = null;
    private clock: THREE.Clock | null = null;

    public player: Player | null = null;
    private thirdPersonCamera: ThirdPersonCamera | null = null;
    private controls: Controls | null = null;

    private physics: Physics | null = null;
    public inventory: Inventory | null = null;
    public eventLog: EventLog | null = null;
    private interactionSystem: InteractionSystem | null = null;

    private hud: HUD | null = null;
    private minimap: Minimap | null = null;
    private inventoryDisplay: InventoryDisplay | null = null;
    private journalDisplay: JournalDisplay | null = null;

    public entities: Array<Entity | THREE.Object3D> = [];
    public collidableObjects: THREE.Object3D[] = [];
    public interactableObjects: Array<Entity | InteractableObject | THREE.Object3D> = [];

    public isPaused: boolean = false;

    constructor() {
        (window as any).game = this;
    }

    public init(): void {
        console.log("Initializing game...");
        this.clock = new THREE.Clock();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('game-container')?.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 150, 600);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        this.inventory = new Inventory(24);
        this.eventLog = new EventLog(75);

        setupLighting(this.scene);
        const terrain = createTerrain(WORLD_SIZE, TERRAIN_SEGMENTS);
        this.scene.add(terrain);
        this.collidableObjects.push(terrain);
        createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);

        const playerSpawnPos = new THREE.Vector3(0, 0, 5);
        playerSpawnPos.y = getTerrainHeightGame(playerSpawnPos.x, playerSpawnPos.z) + 0.5;
        this.player = new Player(this.scene, playerSpawnPos);
        this.entities.push(this.player);
        this.collidableObjects.push(this.player.mesh);
        this.player.setEventLog(this.eventLog);

        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.player.mesh);
        this.controls = new Controls(this.player, this.thirdPersonCamera, this.renderer.domElement);

        this.physics = new Physics(this.player, this.collidableObjects);

        populateEnvironment(
            this.scene, WORLD_SIZE, this.collidableObjects,
            this.interactableObjects, this.entities,
            this.inventory, this.eventLog
        );

        this.interactionSystem = new InteractionSystem(
            this.player, this.camera, this.interactableObjects,
            this.controls, this.inventory, this.eventLog
        );

        this.hud = new HUD(this.player);
        this.minimap = new Minimap(document.getElementById('minimap-canvas') as HTMLCanvasElement | null, this.player, this.entities, WORLD_SIZE);
        this.inventoryDisplay = new InventoryDisplay(this.inventory);
        this.journalDisplay = new JournalDisplay(this.eventLog);

        this.setupUIControls();

        this.eventLog.addEntry("Welcome! Click window to lock controls. [I] Inventory, [J] Journal, [E] Interact, [Esc] Unlock/Close UI");
        console.log("Game initialization complete.");
    }

    private setupUIControls(): void {
        if (!this.controls || !this.inventoryDisplay || !this.journalDisplay) return;

        this.controls.addKeyDownListener('KeyI', () => {
            this.journalDisplay?.hide();
            this.inventoryDisplay?.toggle();
            this.setPauseState(this.inventoryDisplay?.isOpen ?? false);
        });

        this.controls.addKeyDownListener('KeyJ', () => {
            this.inventoryDisplay?.hide();
            this.journalDisplay?.toggle();
            this.setPauseState(this.journalDisplay?.isOpen ?? false);
        });

        this.controls.addKeyDownListener('Escape', () => {
            if (this.inventoryDisplay?.isOpen) {
                this.inventoryDisplay.hide();
                this.setPauseState(false);
            } else if (this.journalDisplay?.isOpen) {
                this.journalDisplay.hide();
                this.setPauseState(false);
            } else if (this.controls?.isPointerLocked) {
                this.controls.unlockPointer();
            }
        });

        this.controls.addMouseClickListener(0, (event: MouseEvent) => {
            if (this.inventoryDisplay?.isOpen && event.target) {
                this.handleInventoryClick(event);
            }
        });
    }

    private handleInventoryClick(event: MouseEvent): void {
        if (!this.inventoryDisplay?.isOpen || !this.player || !this.inventory || !this.eventLog) return;

        const slotElement = (event.target as HTMLElement)?.closest('.inventory-slot') as HTMLElement | null;
        if (!slotElement) return;

        const index = parseInt(slotElement.dataset.index ?? '-1', 10);
        if (index === -1) return;

        const item = this.inventory.getItem(index);
        if (!item) return;

        console.log(`Clicked on item: ${item.name} in slot ${index}`);

        if (item.name === 'Health Potion') {
            if (this.player.health < this.player.maxHealth) {
                this.player.heal(25);
                if (this.inventory.removeItemByIndex(index, 1)) {
                    this.eventLog.addEntry(`Used a Health Potion. Ahh, refreshing!`);
                }
            } else {
                this.eventLog.addEntry(`Your health is already full.`);
            }
        } else {
            this.eventLog.addEntry(`You examine the ${item.name}.`);
        }
         event.stopPropagation();
    }

    public setPauseState(paused: boolean): void {
        if (this.isPaused === paused) return;
        this.isPaused = paused;
        console.log(`Game ${paused ? 'paused' : 'resumed'}.`);

        if (!this.controls) return;

        if (this.isPaused) {
            this.controls.unlockPointer();
        } else {
            if (!this.inventoryDisplay?.isOpen && !this.journalDisplay?.isOpen) {
                this.controls.lockPointer();
            }
        }
    }

    public start(): void {
        if (!this.renderer || !this.clock) {
            console.error("Game not initialized properly. Call init() before start().");
            return;
        }
        console.log("Starting game loop...");
        this.renderer.setAnimationLoop(this.update.bind(this));
    }

    private update(): void {
        if (!this.clock || !this.renderer || !this.scene || !this.camera || !this.player) return;

        const deltaTime = Math.min(this.clock.getDelta(), 0.05);

        this.controls?.update(deltaTime);

        if (!this.isPaused) {
            this.player.update(deltaTime, this.controls!.moveState, this.collidableObjects);
            this.physics?.update(deltaTime);

             this.entities.forEach(entity => {
                if (entity !== this.player && typeof (entity as any).update === 'function') {
                    try {
                        (entity as any).update(deltaTime, this.player, this.collidableObjects);
                    } catch (error) {
                        console.error(`Error updating entity ${(entity as any).name ?? (entity as any).id}:`, error);
                    }
                }
             });

            this.interactionSystem?.update(deltaTime);
            this.thirdPersonCamera?.update(deltaTime, this.collidableObjects);

            if (this.player.isDead) {
                this.respawnPlayer();
            }
        }

        this.hud?.update();
        this.minimap?.update();

        try {
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error("Error during rendering:", error);
        }
    }

    private respawnPlayer(): void {
        if (!this.player || !this.inventory || !this.eventLog || !this.interactionSystem) return;

        console.log("Player died. Respawning...");
        this.eventLog.addEntry("You blacked out and woke up back near the village...");

        const goldCount = this.inventory.countItem('gold');
        const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1));
        if (goldPenalty > 0) {
            this.inventory.removeItem('gold', goldPenalty);
            this.eventLog.addEntry(`You lost ${goldPenalty} gold.`);
        }

        const respawnPos = new THREE.Vector3(0, 0, 10);
        respawnPos.y = getTerrainHeightGame(respawnPos.x, respawnPos.z) + 0.5;
        this.player.respawn(respawnPos);

        this.setPauseState(false);
        this.interactionSystem.cancelGatherAction();
    }

    public onWindowResize(): void {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            console.log("Window resized.");
        }
    }

    public dispose(): void {
        console.log("Disposing game...");
        if (this.renderer) {
            this.renderer.setAnimationLoop(null);
            this.renderer.domElement.parentNode?.removeChild(this.renderer.domElement);
            this.renderer.dispose();
        }
        this.controls?.dispose();
        this.inventoryDisplay?.dispose();
        this.journalDisplay?.dispose();

        if (this.scene) {
            this.scene.traverse((object) => {
                if (!object) return;
                if (object instanceof THREE.Mesh) {
                    object.geometry?.dispose();
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material?.dispose());
                    } else {
                        object.material?.dispose();
                    }
                }
            });
        }

        this.entities = [];
        this.collidableObjects = [];
        this.interactableObjects = [];
        this.scene = null;
        this.player = null;

        (window as any).game = null;
        console.log("Game disposed.");
    }
}


function checkWebGL(): boolean {
    if (WebGL.isWebGLAvailable()) {
        return true;
    } else {
        const warning = WebGL.getWebGLErrorMessage();
        try {
            const container = document.getElementById('game-container') ?? document.body;
            container.appendChild(warning);
        } catch (e) {
            console.error("Could not display WebGL error message:", e);
            alert("WebGL is not supported or enabled on your browser.");
        }
        return false;
    }
}

if (checkWebGL()) {
    let gameInstance: Game | null = null;

    try {
        gameInstance = new Game();
        gameInstance.init();
        gameInstance.start();

        const onResize = () => gameInstance?.onWindowResize();
        window.addEventListener('resize', onResize, false);

        console.log("Low-Poly Wilderness (TypeScript) initialized.");

        window.addEventListener('beforeunload', () => {
            window.removeEventListener('resize', onResize);
            gameInstance?.dispose();
        });

    } catch (error: unknown) {
        console.error("An error occurred during game initialization or runtime:", error);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; padding: 20px;
            background-color: rgba(200, 0, 0, 0.9); color: white; z-index: 1000;
            font-family: monospace; white-space: pre-wrap; border-bottom: 2px solid darkred;
        `;
        let errorMessage = "Unknown Error";
        if (error instanceof Error) {
            errorMessage = `<h2>Game Error</h2><p>An unexpected error occurred. Please try refreshing.</p><pre>${error.message}\n${error.stack}</pre>`;
        } else {
             errorMessage = `<h2>Game Error</h2><p>An unexpected error occurred. Please try refreshing.</p><pre>${String(error)}</pre>`;
        }
        errorDiv.innerHTML = errorMessage;
        document.body.appendChild(errorDiv);

        gameInstance?.dispose();
    }
} else {
    console.error("WebGL check failed. Game cannot start.");
}

