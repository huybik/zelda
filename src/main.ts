import {
  AmbientLight, Box3, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight,
  DoubleSide, Fog, Group, HemisphereLight, Material, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial,  PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Quaternion,
  Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer, MathUtils, Object3D
} from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { Clock } from 'three';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';

interface EntityUserData {
  entityReference: Entity | InteractableObject | null;
  isEntity: boolean;
  isPlayer: boolean;    
  isNPC: boolean;
  isCollidable: boolean;
  isInteractable: boolean;
  interactionType?: string;
  prompt?: string;
  id: string;
  boundingBox?: Box3;
  height?: number;
  radius?: number;
  [key: string]: unknown;
}

interface InteractionResult {
  type: 'reward' | 'message' | 'dialogue' | 'item_retrieved' | 'error' | 'gather_start';
  item?: { name: string; amount: number };
  message?: string;
  text?: string;
  state?: string;
}

interface TargetInfo {
  mesh: Object3D;
  instance: Entity | InteractableObject | Object3D;
  point: Vector3;
  distance: number;
}

interface ActiveGather {
  targetInstance: Entity | InteractableObject | Object3D;
  startTime: number;
  duration: number;
  resource: string;
}

interface InventoryItem {
  name: string;
  count: number;
  icon?: string;
}

interface EventEntry {
  timestamp: string;
  message: string;
}

interface KeyState {
  [key: string]: boolean | undefined;
}

interface MouseState {
  x: number;
  y: number;
  dx: number;
  dy: number;
  buttons: { [key: number]: boolean | undefined };
}

interface MoveState {
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
  interact: boolean;
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function smoothVectorLerp(current: Vector3, target: Vector3, alphaBase: number, deltaTime: number): Vector3 {
  if (alphaBase <= 0) return current.copy(target);
  if (alphaBase >= 1) return current;
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.lerp(target, factor);
}

function smoothQuaternionSlerp(current: Quaternion, target: Quaternion, alphaBase: number, deltaTime: number): Quaternion {
  if (alphaBase <= 0) return current.copy(target);
  if (alphaBase >= 1) return current;
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.slerp(target, factor);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

const Colors = {
  PASTEL_GREEN: 0x98FB98,
  PASTEL_BROWN: 0xCD853F,
  PASTEL_GRAY: 0xB0C4DE,
  FOREST_GREEN: 0x228B22,
} as const;

let nextEntityId = 0;

class Entity {
  id: string;
  mesh: Group | null;
  scene: Scene | null;
  name: string;
  velocity: Vector3;
  boundingBox: Box3;
  health: number;
  maxHealth: number;
  isDead: boolean;
  userData: EntityUserData;

  constructor(scene: Scene, position: Vector3, name: string = 'Entity') {
    this.id = `${name}_${nextEntityId++}`;
    this.scene = scene;
    this.name = name;
    this.mesh = new Group();
    this.mesh.position.copy(position);
    this.velocity = new Vector3();
    this.boundingBox = new Box3();
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
    if (this.mesh) {
      this.mesh.userData = this.userData;
      this.mesh.name = this.name;
      this.scene.add(this.mesh);
    }
  }

  update(deltaTime: number, player?: Entity, collidables?: Object3D[]): void {}

  updateBoundingBox(): void {
    if (!this.mesh) return;
    this.boundingBox.setFromObject(this.mesh);
    this.userData.boundingBox = this.boundingBox;
  }

  setPosition(position: Vector3): void {
    if (!this.mesh) return;
    this.mesh.position.copy(position);
    this.updateBoundingBox();
  }

  lookAt(targetPosition: Vector3): void {
    if (!this.mesh) return;
    const target = targetPosition.clone();
    target.y = this.mesh.position.y;
    if (target.distanceToSquared(this.mesh.position) < 0.001) return;
    this.mesh.lookAt(target);
  }

  takeDamage(amount: number): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.die();
  }

  heal(amount: number): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.velocity.set(0, 0, 0);
    this.health = 0;
    this.userData.isCollidable = false;
    this.userData.isInteractable = false;
  }

  destroy(): void {
    if (!this.mesh || !this.scene) return;
    this.mesh.traverse(child => {
      if (child instanceof Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat: Material) => mat?.dispose());
        } else {
          (child.material as Material)?.dispose();
        }
      }
    });
    this.scene.remove(this.mesh);
    this.mesh = null;
    this.scene = null;
    this.userData.entityReference = null;
  }
}

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const groundCheckOrigin = new Vector3();
const groundCheckDirection = new Vector3(0, -1, 0);

class Player extends Entity {
  maxStamina: number;
  stamina: number;
  walkSpeed: number;
  runSpeed: number;
  jumpForce: number;
  staminaDrainRate: number;
  staminaRegenRate: number;
  staminaJumpCost: number;
  canJump: boolean;
  isSprinting: boolean;
  isExhausted: boolean;
  exhaustionThreshold: number;
  moveState: MoveState;
  gravity: number;
  isOnGround: boolean;
  groundCheckDistance: number;
  lastVelocityY: number;
  headMesh?: Mesh;
  leftArm?: Mesh;
  rightArm?: Mesh;
  leftLeg?: Mesh;
  rightLeg?: Mesh;
  eventLog: EventLog | null = null;

  constructor(scene: Scene, position: Vector3) {
    super(scene, position, 'Player');
    this.userData.isPlayer = true;
    this.userData.isCollidable = true;
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

  setEventLog(eventLog: EventLog): void {
    this.eventLog = eventLog;
  }

  createModel(): void {
    const bodyMat = new MeshLambertMaterial({ color: 0x0077ff });
    const headMat = new MeshLambertMaterial({ color: 0xffdab9 });
    const limbRadius = 0.15;
    const armLength = 0.8;
    const legLength = 0.9;
    const bodyHeight = 1.0;
    const headRadiusVal = 0.3;
    const bodyGeo = new BoxGeometry(0.8, bodyHeight, 0.5);
    const bodyMesh = new Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = legLength + bodyHeight / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.mesh!.add(bodyMesh);
    const headGeo = new SphereGeometry(headRadiusVal, 16, 16);
    this.headMesh = new Mesh(headGeo, headMat);
    this.headMesh.position.y = bodyMesh.position.y + bodyHeight / 2 + headRadiusVal;
    this.headMesh.castShadow = true;
    this.mesh!.add(this.headMesh);
    const armOffsetY = bodyMesh.position.y + bodyHeight * 0.4;
    const armOffsetX = 0.5;
    const leftArmGeo = new CylinderGeometry(limbRadius, limbRadius * 0.9, armLength, 8);
    leftArmGeo.translate(0, -armLength / 2, 0);
    this.leftArm = new Mesh(leftArmGeo, bodyMat);
    this.leftArm.position.set(-armOffsetX, armOffsetY, 0);
    this.leftArm.castShadow = true;
    this.mesh!.add(this.leftArm);
    const rightArmGeo = new CylinderGeometry(limbRadius, limbRadius * 0.9, armLength, 8);
    rightArmGeo.translate(0, -armLength / 2, 0);
    this.rightArm = new Mesh(rightArmGeo, bodyMat);
    this.rightArm.position.set(armOffsetX, armOffsetY, 0);
    this.rightArm.castShadow = true;
    this.mesh!.add(this.rightArm);
    const legOffsetY = bodyMesh.position.y - bodyHeight / 2;
    const legOffsetX = 0.2;
    const leftLegGeo = new CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
    leftLegGeo.translate(0, -legLength / 2, 0);
    this.leftLeg = new Mesh(leftLegGeo, bodyMat);
    this.leftLeg.position.set(-legOffsetX, legOffsetY, 0);
    this.leftLeg.castShadow = true;
    this.mesh!.add(this.leftLeg);
    const rightLegGeo = new CylinderGeometry(limbRadius, limbRadius * 1.1, legLength, 8);
    rightLegGeo.translate(0, -legLength / 2, 0);
    this.rightLeg = new Mesh(rightLegGeo, bodyMat);
    this.rightLeg.position.set(legOffsetX, legOffsetY, 0);
    this.rightLeg.castShadow = true;
    this.mesh!.add(this.rightLeg);
    this.userData.height = PLAYER_HEIGHT;
    this.userData.radius = PLAYER_RADIUS;
  }

  update(deltaTime: number, moveState: MoveState, collidables: Object3D[]): void {
    if (this.isDead) return;
    this.moveState = moveState;
    const wasOnGround = this.isOnGround;
    this.handleStamina(deltaTime);
    this.handleMovement(deltaTime);
    this.applyGravity(deltaTime);
    this.mesh!.position.x += this.velocity.x * deltaTime;
    this.mesh!.position.z += this.velocity.z * deltaTime;
    this.checkGround(collidables);
    this.mesh!.position.y += this.velocity.y * deltaTime;
    
    this.lastVelocityY = this.velocity.y;
    this.animateMovement(deltaTime);
    this.updateBoundingBox();
  }

  handleStamina(deltaTime: number): void {
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

  handleMovement(deltaTime: number): void {
    const forward = new Vector3();
    const right = new Vector3();
    const moveDirection = new Vector3();
    const moveVelocity = new Vector3();
    const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
    forward.set(0, 0, -1).applyQuaternion(this.mesh!.quaternion);
    right.set(1, 0, 0).applyQuaternion(this.mesh!.quaternion);
    moveDirection.set(this.moveState.right, 0, this.moveState.forward).normalize();
    moveVelocity.set(0, 0, 0)
      .addScaledVector(forward, moveDirection.z)
      .addScaledVector(right, moveDirection.x);
    if (moveDirection.lengthSq() > 0) {
      moveVelocity.normalize().multiplyScalar(currentSpeed);
    }
    this.velocity.x = moveVelocity.x;
    this.velocity.z = moveVelocity.z;
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

  applyGravity(deltaTime: number): void {
    if (!this.isOnGround || this.velocity.y > 0) {
      this.velocity.y += this.gravity * deltaTime;
    } else {
      this.velocity.y = Math.max(this.gravity * deltaTime, -0.1);
    }
  }

  checkGround(collidables: Object3D[]): void {
    groundCheckOrigin.copy(this.mesh!.position).add(new Vector3(0, 0.1, 0));
    const rayLength = 0.1 + this.groundCheckDistance;
    const raycaster = new Raycaster(groundCheckOrigin, groundCheckDirection, 0, rayLength);
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
    const playerBaseY = this.mesh!.position.y;
    const snapThreshold = 0.05;
    if (foundGround && playerBaseY <= groundY + this.groundCheckDistance + snapThreshold) {
      if (!this.isOnGround && this.velocity.y <= 0) {
        this.mesh!.position.y = groundY;
        this.velocity.y = 0;
        this.isOnGround = true;
        this.canJump = true;
      } else if (this.isOnGround) {
        this.mesh!.position.y = Math.max(this.mesh!.position.y, groundY);
      } else {
        this.isOnGround = false;
        this.canJump = false;
      }
    } else {
      this.isOnGround = false;
      this.canJump = false;
    }
  }

  
  animateMovement(deltaTime: number): void {
    const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const maxSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
    const speedRatio = maxSpeed > 0 ? MathUtils.clamp(horizontalSpeed / maxSpeed, 0, 1) : 0;
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
      if (this.rightArm) this.rightArm.rotation.x = MathUtils.lerp(this.rightArm.rotation.x, 0, restLerpFactor);
      if (this.leftArm) this.leftArm.rotation.x = MathUtils.lerp(this.leftArm.rotation.x, 0, restLerpFactor);
      if (this.rightLeg) this.rightLeg.rotation.x = MathUtils.lerp(this.rightLeg.rotation.x, 0, restLerpFactor);
      if (this.leftLeg) this.leftLeg.rotation.x = MathUtils.lerp(this.leftLeg.rotation.x, 0, restLerpFactor);
    }
  }

  die(): void {
    if (this.isDead) return;
    super.die();
    this.eventLog?.addEntry("You have died!");
  }

  respawn(position: Vector3): void {
    this.setPosition(position);
    this.health = this.maxHealth * 0.75;
    this.stamina = this.maxStamina;
    this.velocity.set(0, 0, 0);
    this.isDead = false;
    this.isExhausted = false;
    this.isOnGround = false;
    this.canJump = false;
    this.lastVelocityY = 0;
    this.eventLog?.addEntry("You feel slightly disoriented but alive.");
    this.updateBoundingBox();
  }

  updateBoundingBox(): void {
    if (!this.mesh) return;
    const height = this.userData.height ?? PLAYER_HEIGHT;
    const radius = this.userData.radius ?? PLAYER_RADIUS;
    const center = this.mesh.position.clone().add(new Vector3(0, height / 2, 0));
    const size = new Vector3(radius * 2, height, radius * 2);
    this.boundingBox.setFromCenterAndSize(center, size);
    this.userData.boundingBox = this.boundingBox;
  }
}

const playerPosition = new Vector3();
const targetLookAt = new Vector3();
const targetDirection = new Vector3();
const targetQuaternion = new Quaternion();
const lookAtMatrix = new Matrix4();

type AccessoryType = 'none' | 'straw_hat' | 'cap';
type DialogueState = 'idle' | 'greeting';

class NPC extends Entity {
  accessoryType: AccessoryType;
  inventory: Inventory | null;
  dialogueState: DialogueState;
  interactionPrompt: string;
  idleTimer: number;
  idleLookTarget: Vector3;
  baseQuaternion: Quaternion;
  baseForward: Vector3;

  constructor(scene: Scene, position: Vector3, name: string, accessoryType: AccessoryType = 'none', inventory: Inventory | null) {
    super(scene, position, name);
    this.userData.isNPC = true;
    this.userData.isInteractable = true;
    this.userData.interactionType = 'talk';
    this.accessoryType = accessoryType;
    this.inventory = inventory;
    this.dialogueState = 'idle';
    this.interactionPrompt = `Press E to talk to ${this.name}`;
    this.userData.prompt = this.interactionPrompt;
    this.createModel();
    this.idleTimer = 2 + Math.random() * 3;
    this.idleLookTarget = new Vector3();
    this.mesh!.updateMatrixWorld();
    this.baseQuaternion = this.mesh!.quaternion.clone();
    this.baseForward = new Vector3(0, 0, 1).applyQuaternion(this.baseQuaternion);
    this.idleLookTarget.copy(this.mesh!.position).addScaledVector(this.baseForward, 5);
    this.updateBoundingBox();
  }

  createModel(): void {
    const bodyMat = new MeshLambertMaterial({ color: Math.random() * 0xffffff });
    const headMat = new MeshLambertMaterial({ color: 0xffdab9 });
    const bodyHeight = 1.1;
    const headRadius = 0.3;
    const bodyGeo = new BoxGeometry(0.7, bodyHeight, 0.4);
    const bodyMesh = new Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = bodyHeight / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.mesh!.add(bodyMesh);
    const headGeo = new SphereGeometry(headRadius, 16, 16);
    const headMesh = new Mesh(headGeo, headMat);
    headMesh.position.y = bodyHeight + headRadius;
    headMesh.castShadow = true;
    this.mesh!.add(headMesh);
    this.addAccessory(headMesh.position);
    this.userData.height = bodyHeight + headRadius * 2;
  }

  addAccessory(headPosition: Vector3): void {
    let accessory: Object3D | null = null;
    let accessoryMat = new MeshLambertMaterial({ color: 0x8B4513 });
    switch (this.accessoryType) {
      case 'straw_hat':
        accessoryMat = new MeshLambertMaterial({ color: 0xFFEC8B });
        const brimGeo = new CylinderGeometry(0.6, 0.7, 0.1, 16);
        const topGeo = new CylinderGeometry(0.4, 0.3, 0.3, 16);
        accessory = new Group();
        const brimMesh = new Mesh(brimGeo, accessoryMat);
        const topMesh = new Mesh(topGeo, accessoryMat);
        topMesh.position.y = 0.15;
        accessory.add(brimMesh, topMesh);
        accessory.position.set(headPosition.x, headPosition.y + 0.25, headPosition.z);
        break;
      case 'cap':
        accessoryMat = new MeshLambertMaterial({ color: 0x4682B4 });
        const capGeo = new SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        accessory = new Mesh(capGeo, accessoryMat);
        accessory.position.set(headPosition.x, headPosition.y + 0.1, headPosition.z);
        accessory.rotation.x = -0.1;
        break;
    }
    if (accessory) {
      accessory.traverse(child => { if (child instanceof Mesh) child.castShadow = true; });
      this.mesh!.add(accessory);
    }
  }

  interact(player: Player): InteractionResult | null {
    playerPosition.copy(player.mesh!.position);
    playerPosition.y = this.mesh!.position.y;
    this.mesh!.lookAt(playerPosition);
    this.idleLookTarget.copy(playerPosition);
    this.idleTimer = 3.0;
    const dialogue = this.getRandomIdleDialogue();
    this.dialogueState = 'greeting';
    player.eventLog?.addEntry(`${this.name}: "${dialogue}"`);
    return { type: 'dialogue', text: dialogue, state: this.dialogueState };
  }

  getRandomIdleDialogue(): string {
    const dialogues = [
      "Nice weather today.", "Be careful out there.", "Seen any trouble makers around?",
      "The wilderness holds many secrets.", "Welcome to our village.", "Need something?",
      "Don't wander too far from the village.",
    ];
    return dialogues[Math.floor(Math.random() * dialogues.length)];
  }

  update(deltaTime: number, player: Player): void {
    this.idleTimer -= deltaTime;
    if (this.idleTimer <= 0) {
      this.idleTimer = 3 + Math.random() * 4;
      const distanceToPlayerSq = this.mesh!.position.distanceToSquared(player.mesh!.position);
      if (distanceToPlayerSq < 15 * 15 && Math.random() < 0.3) {
        targetLookAt.copy(player.mesh!.position).setY(this.mesh!.position.y);
        this.idleLookTarget.copy(targetLookAt);
      } else {
        if (Math.random() < 0.5) {
          const randomAngleOffset = (Math.random() - 0.5) * Math.PI * 1.5;
          const randomDirection = this.baseForward.clone().applyAxisAngle(new Vector3(0, 1, 0), randomAngleOffset);
          this.idleLookTarget.copy(this.mesh!.position).addScaledVector(randomDirection, 5);
        } else {
          this.idleLookTarget.copy(this.mesh!.position).addScaledVector(this.baseForward, 5);
        }
      }
    }
    targetDirection.copy(this.idleLookTarget).sub(this.mesh!.position);
    targetDirection.y = 0;
    if (targetDirection.lengthSq() > 0.01) {
      targetDirection.normalize();
      targetLookAt.copy(this.mesh!.position).add(targetDirection);
      lookAtMatrix.lookAt(targetLookAt, this.mesh!.position, this.mesh!.up);
      targetQuaternion.setFromRotationMatrix(lookAtMatrix);
      smoothQuaternionSlerp(this.mesh!.quaternion, targetQuaternion, 0.05, deltaTime);
    }
  }

  updateBoundingBox(): void {
    if (!this.mesh) return;
    const height = this.userData.height ?? 1.7;
    const radius = 0.4;
    const center = this.mesh.position.clone().add(new Vector3(0, height / 2, 0));
    const size = new Vector3(radius * 2, height, radius * 2);
    this.boundingBox.setFromCenterAndSize(center, size);
    this.userData.boundingBox = this.boundingBox;
  }
}

class Inventory {
  size: number;
  items: Array<InventoryItem | null>;
  onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
  itemMaxStack: Record<string, number>;

  constructor(size: number = 20) {
    this.size = size;
    this.items = new Array(size).fill(null);
    this.onChangeCallbacks = [];
    this.itemMaxStack = {
      'default': 64, 'wood': 99, 'stone': 99, 'herb': 30, 'feather': 50,
      'Health Potion': 10, 'gold': Infinity
    };
  }

  getMaxStack(itemName: string): number {
    return this.itemMaxStack[itemName] ?? this.itemMaxStack['default'];
  }

  addItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;
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
        if (!this.items[i]) {
          const amountToAdd = Math.min(remainingCount, maxStack);
          this.items[i] = { name: itemName, count: amountToAdd, icon: itemName.toLowerCase().replace(/ /g, '_').replace(/'/g, '') };
          remainingCount -= amountToAdd;
          changed = true;
        }
      }
    }
    if (changed) this.notifyChange();
    return remainingCount === 0;
  }

  removeItem(itemName: string, count: number = 1): boolean {
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
        if (slot.count === 0) this.items[i] = null;
      }
    }
    if (changed) this.notifyChange();
    return neededToRemove === 0;
  }

  removeItemByIndex(index: number, count: number = 1): boolean {
    if (index < 0 || index >= this.size || !this.items[index] || count <= 0) return false;
    const item = this.items[index]!;
    const removeCount = Math.min(count, item.count);
    item.count -= removeCount;
    if (item.count === 0) this.items[index] = null;
    this.notifyChange();
    return true;
  }

  countItem(itemName: string): number {
    return this.items.reduce((total, item) => total + (item?.name === itemName ? item.count : 0), 0);
  }

  getItem(index: number): InventoryItem | null {
    return (index >= 0 && index < this.size) ? this.items[index] : null;
  }

  onChange(callback: (items: Array<InventoryItem | null>) => void): void {
    if (typeof callback === 'function') this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    const itemsCopy = this.items.map(item => item ? { ...item } : null);
    this.onChangeCallbacks.forEach(cb => cb(itemsCopy));
  }
}

class EventLog {
  entries: EventEntry[];
  maxEntries: number;
  onChangeCallbacks: Array<(entries: string[]) => void>;

  constructor(maxEntries: number = 50) {
    this.entries = [];
    this.maxEntries = Math.max(1, maxEntries);
    this.onChangeCallbacks = [];
  }

  addEntry(message: string): void {
    if (!message || typeof message !== 'string') return;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.entries.push({ timestamp, message });
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.notifyChange();
  }

  getFormattedEntries(): string[] {
    return [...this.entries].reverse().map(entry => `[${entry.timestamp}] ${entry.message}`);
  }

  onChange(callback: (entries: string[]) => void): void {
    if (typeof callback === 'function') this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    const formattedEntries = this.getFormattedEntries();
    this.onChangeCallbacks.forEach(cb => cb(formattedEntries));
  }
}

const cameraDirection = new Vector3();
const objectDirection = new Vector3();
const playerDirection = new Vector3();
const objectPosition = new Vector3();
const center = new Vector3();
const size = new Vector3();

class InteractableObject {
  id: string;
  position: Vector3;
  interactionType: string;
  data: any;
  prompt: string;
  mesh: Mesh | Group | null;
  isActive: boolean;
  userData: EntityUserData;

  constructor(id: string, position: Vector3, interactionType: string, data: any, prompt: string, scene: Scene | null = null) {
    this.id = id;
    this.position = position.clone();
    this.interactionType = interactionType;
    this.data = data;
    this.prompt = prompt;
    this.mesh = null;
    this.isActive = true;
    this.userData = {
      id: this.id,
      entityReference: this,
      isInteractable: true,
      interactionType: this.interactionType,
      prompt: this.prompt,
      data: this.data,
      isSimpleObject: true,
      isEntity: false,
      isPlayer: false,
      isNPC: false,
      isCollidable: false,
    };
  }

  interact(player: Player, inventory: Inventory, eventLog: EventLog): InteractionResult | null {
    if (!this.isActive) return { type: 'error', message: 'Already used.' };
    switch (this.interactionType) {
      case 'retrieve':
        const itemName = this.data as string;
        if (inventory.addItem(itemName, 1)) {
          eventLog.addEntry(`You picked up: ${itemName}`);
          this.removeFromWorld();
          return { type: 'item_retrieved', item: { name: itemName, amount: 1 } };
        } else {
          eventLog.addEntry(`Your inventory is full.`);
          return { type: 'error', message: 'Inventory full' };
        }
      case 'read_sign':
        const signText = this.data as string || "The sign is worn and illegible.";
        eventLog.addEntry(`Sign: "${signText}"`);
        return { type: 'message', message: signText };
      default:
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
}

class InteractionSystem {
  player: Player;
  camera: PerspectiveCamera;
  interactableEntities: Array<Entity | InteractableObject | Object3D>;
  controls: Controls;
  inventory: Inventory;
  eventLog: EventLog;
  raycaster: Raycaster;
  interactionDistance: number = 3.0;
  aimTolerance: number = Math.PI / 6;
  currentTarget: Entity | InteractableObject | Object3D | null = null;
  currentTargetMesh: Object3D | null = null;
  interactionPromptElement: HTMLElement | null;
  activeGather: ActiveGather | null = null;
  promptTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(player: Player, camera: PerspectiveCamera, interactableEntities: Array<Entity | InteractableObject | Object3D>, controls: Controls, inventory: Inventory, eventLog: EventLog) {
    this.player = player;
    this.camera = camera;
    this.interactableEntities = interactableEntities;
    this.controls = controls;
    this.inventory = inventory;
    this.eventLog = eventLog;
    this.raycaster = new Raycaster();
    this.interactionPromptElement = document.getElementById('interaction-prompt');
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
        this.showPrompt(targetInfo.instance.userData.prompt || "Press E to interact");
      }
      if (this.controls.consumeInteraction()) this.tryInteract(this.currentTarget);
    } else if (this.currentTarget) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
    }
  }

  findInteractableTarget(): TargetInfo | null {
    this.raycaster.setFromCamera(new Vector2(0, 0), this.camera);
    this.raycaster.far = this.interactionDistance;
    const meshesToCheck = this.interactableEntities
      .map(item => (item as any).mesh ?? item)
      .filter((mesh): mesh is Object3D => mesh instanceof Object3D && mesh.userData?.isInteractable && mesh.visible);
    let closestHit: TargetInfo | null = null;
    const intersects = this.raycaster.intersectObjects(meshesToCheck, true);
    if (intersects.length > 0) {
      for (const intersect of intersects) {
        let hitObject: Object3D | null = intersect.object;
        let rootInstance: Entity | InteractableObject | Object3D | null = null;
        let rootMesh: Object3D | null = null;
        while (hitObject) {
          if (hitObject.userData?.isInteractable && hitObject.userData?.entityReference) {
            rootInstance = hitObject.userData.entityReference;
            rootMesh = hitObject;
            break;
          }
          if (hitObject.userData?.isInteractable && hitObject.userData?.isSimpleObject) {
            rootInstance = this.interactableEntities.find(e => (e as any).mesh === hitObject) || hitObject.userData?.entityReference;
            rootMesh = hitObject;
            break;
          }
          hitObject = hitObject.parent;
        }
        if (rootInstance && rootMesh && rootInstance.userData?.isInteractable) {
          objectDirection.copy(intersect.point).sub(this.camera.position).normalize();
          this.camera.getWorldDirection(cameraDirection);
          const angle = cameraDirection.angleTo(objectDirection);
          if (angle < this.aimTolerance) {
            closestHit = { mesh: rootMesh, instance: rootInstance, point: intersect.point, distance: intersect.distance };
            break;
          }
        }
      }
    }
    return closestHit || this.findNearbyInteractable();
  }

  findNearbyInteractable(): TargetInfo | null {
    this.player.mesh!.getWorldPosition(playerPosition);
    let closestDistSq = this.interactionDistance * this.interactionDistance;
    let closestInstance: Entity | InteractableObject | Object3D | null = null;
    this.interactableEntities.forEach(item => {
      if (!item?.userData?.isInteractable || item === this.player.mesh) return;
      if (item.userData?.isSimpleObject && !(item as InteractableObject).isActive) return;
      const objMesh = (item as any).mesh ?? item;
      if (!objMesh || !objMesh.visible) return;
      objMesh.getWorldPosition(objectPosition);
      const distSq = playerPosition.distanceToSquared(objectPosition);
      if (distSq < closestDistSq) {
        this.player.mesh!.getWorldDirection(playerDirection);
        objectDirection.copy(objectPosition).sub(playerPosition).normalize();
        const angle = playerDirection.angleTo(objectDirection);
        if (angle < Math.PI / 2.5) {
          closestDistSq = distSq;
          closestInstance = item;
        }
      }
    });
    if (closestInstance) {
      const mesh = (closestInstance as any).mesh ?? closestInstance;
      mesh.getWorldPosition(objectPosition);
      return { mesh, instance: closestInstance, point: objectPosition.clone(), distance: this.player.mesh!.position.distanceTo(objectPosition) };
    }
    return null;
  }

  tryInteract(targetInstance: Entity | InteractableObject | Object3D): void {
    if (!targetInstance || !targetInstance.userData?.isInteractable) return;
    const distance = this.player.mesh!.position.distanceTo((targetInstance as any).mesh!.position);
    if (distance > this.interactionDistance * 1.1) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
      return;
    }
    let result: InteractionResult | null = null;
    if (typeof (targetInstance as any).interact === 'function') {
      result = (targetInstance as any).interact(this.player, this.inventory, this.eventLog);
    } else if (targetInstance.userData.interactionType === 'gather' && targetInstance.userData.resource) {
      this.startGatherAction(targetInstance);
      result = { type: 'gather_start' };
    } else {
      result = { type: 'message', message: "You look at the object." };
    }
    if (result) this.handleInteractionResult(result, targetInstance);
    if (result?.type !== 'gather_start' && !targetInstance.userData?.isInteractable) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
    }
  }

  handleInteractionResult(result: InteractionResult, targetInstance: Entity | InteractableObject | Object3D): void {
    let promptDuration: number | null = 2000;
    let promptText: string | null = null;
    switch (result.type) {
      case 'reward':
        if (result.item && this.inventory.addItem(result.item.name, result.item.amount)) {
          promptText = result.message || `Received ${result.item.amount} ${result.item.name}.`;
          promptDuration = 3000;
          this.eventLog.addEntry(promptText);
        } else if (result.item) {
          promptText = `Found ${result.item.name}, but inventory is full!`;
          promptDuration = 3000;
          this.eventLog.addEntry(promptText);
        } else if (result.message) {
          promptText = result.message;
          promptDuration = 3000;
          this.eventLog.addEntry(promptText);
        }
        break;
      case 'message':
        if (result.message) {
          promptText = result.message;
          this.eventLog.addEntry(promptText);
        }
        break;
      case 'dialogue':
        if (result.text) {
          promptText = `${targetInstance.name ?? 'NPC'}: ${result.text}`;
          promptDuration = 4000;
        }
        break;
      case 'item_retrieved':
        promptDuration = null;
        break;
      case 'error':
        if (result.message) {
          promptText = result.message;
          this.eventLog.addEntry(`Error: ${result.message}`);
        }
        break;
      case 'gather_start':
        promptDuration = null;
        break;
    }
    if (promptText) this.showPrompt(promptText, promptDuration);
  }

  startGatherAction(targetInstance: Entity | InteractableObject | Object3D): void {
    if (this.activeGather) return;
    const resource = targetInstance.userData.resource as string;
    const gatherTime = (targetInstance.userData.gatherTime as number) || 2000;
    this.activeGather = { targetInstance, startTime: performance.now(), duration: gatherTime, resource };
    this.showPrompt(`Gathering ${resource}... (0%)`);
    this.eventLog.addEntry(`Started gathering ${resource}...`);
    this.player.velocity.x = 0;
    this.player.velocity.z = 0;
  }

  updateGatherAction(deltaTime: number): void {
    if (!this.activeGather) return;
    const elapsedTime = performance.now() - this.activeGather.startTime;
    const progress = Math.min(1, elapsedTime / this.activeGather.duration);
    this.showPrompt(`Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`);
    if (progress >= 1) this.completeGatherAction();
  }

  completeGatherAction(): void {
    if (!this.activeGather) return;
    const { resource, targetInstance } = this.activeGather;
    if (this.inventory.addItem(resource, 1)) {
      this.eventLog.addEntry(`Gathered 1 ${resource}.`);
      if (targetInstance.userData.isDepletable) {
        targetInstance.userData.isInteractable = false;
        if (targetInstance instanceof Entity || targetInstance instanceof InteractableObject) {
          if (targetInstance.mesh) targetInstance.mesh.visible = false;
        } else {
          (targetInstance as Object3D).visible = false;
        }
        const respawnTime = targetInstance.userData.respawnTime || 15000;
        setTimeout(() => {
          if (targetInstance.userData) {
            targetInstance.userData.isInteractable = true;
            if (targetInstance instanceof Entity || targetInstance instanceof InteractableObject) {
              if (targetInstance.mesh) targetInstance.mesh.visible = true;
            } else {
              (targetInstance as Object3D).visible = true;
            }
          }
        }, respawnTime);
      } else if (targetInstance.userData.isSimpleObject && typeof (targetInstance as InteractableObject).removeFromWorld === 'function') {
        (targetInstance as InteractableObject).removeFromWorld();
      }
    } else {
      this.eventLog.addEntry(`Inventory full, could not gather ${resource}.`);
    }
    this.activeGather = null;
    this.hidePrompt();
    this.currentTarget = null;
    this.currentTargetMesh = null;
  }

  cancelGatherAction(): void {
    if (!this.activeGather) return;
    this.eventLog.addEntry(`Gathering ${this.activeGather.resource} cancelled.`);
    this.activeGather = null;
    this.hidePrompt();
  }

  showPrompt(text: string, duration: number | null = null): void {
    if (!this.interactionPromptElement || (this.activeGather && duration === null)) return;
    this.interactionPromptElement.textContent = text;
    this.interactionPromptElement.style.display = 'block';
    clearTimeout(this.promptTimeout ?? undefined);
    this.promptTimeout = null;
    if (duration && duration > 0) {
      this.promptTimeout = setTimeout(() => {
        if (this.interactionPromptElement?.textContent === text) this.hidePrompt();
      }, duration);
    }
  }

  hidePrompt(): void {
    if (!this.interactionPromptElement || this.activeGather || this.promptTimeout) return;
    this.interactionPromptElement.style.display = 'none';
    this.interactionPromptElement.textContent = '';
  }
}

const overlap = new Vector3();
const centerPlayer = new Vector3();
const centerObject = new Vector3();
const sizePlayer = new Vector3();
const sizeObject = new Vector3();
const pushVector = new Vector3();
const objectBoundingBox = new Box3();
const objectPositionPhysics = new Vector3();

class Physics {
  player: Player;
  collidableObjects: Object3D[];
  collisionCheckRadiusSq: number = 20 * 20;

  constructor(player: Player, collidableObjects: Object3D[]) {
    this.player = player;
    this.collidableObjects = collidableObjects;
  }

  update(deltaTime: number): void {
    if (this.player.isDead) return;
    const playerBox = this.player.boundingBox;
    if (!playerBox || playerBox.isEmpty()) this.player.updateBoundingBox();
    const playerPos = this.player.mesh!.position;
    this.collidableObjects.forEach(object => {
      if (!object || object === this.player.mesh || !object.userData?.isCollidable || object.userData?.isTerrain || !object.parent) return;
      if (object.userData?.entityReference?.isDead) return;
      object.getWorldPosition(objectPositionPhysics);
      if (playerPos.distanceToSquared(objectPositionPhysics) > this.collisionCheckRadiusSq) return;
      let objectBox = object.userData.boundingBox as Box3 | undefined;
      if (!objectBox || objectBox.isEmpty()) {
        objectBoundingBox.setFromObject(object, true);
        objectBox = objectBoundingBox;
        if (objectBox.isEmpty()) return;
      }
      if (playerBox.intersectsBox(objectBox)) {
        this.resolveCollision(playerBox, objectBox, object);
        this.player.updateBoundingBox();
      }
    });
  }

  resolveCollision(playerBox: Box3, objectBox: Box3, object: Object3D): void {
    playerBox.getCenter(centerPlayer);
    objectBox.getCenter(centerObject);
    playerBox.getSize(sizePlayer);
    objectBox.getSize(sizeObject);
    overlap.x = (sizePlayer.x / 2 + sizeObject.x / 2) - Math.abs(centerPlayer.x - centerObject.x);
    overlap.y = (sizePlayer.y / 2 + sizeObject.y / 2) - Math.abs(centerPlayer.y - centerObject.y);
    overlap.z = (sizePlayer.z / 2 + sizeObject.z / 2) - Math.abs(centerPlayer.z - centerObject.z);
    let minOverlap = Infinity;
    let pushAxis = -1;
    if (overlap.x > 0 && overlap.x < minOverlap) { minOverlap = overlap.x; pushAxis = 0; }
    if (overlap.y > 0 && overlap.y < minOverlap) { minOverlap = overlap.y; pushAxis = 1; }
    if (overlap.z > 0 && overlap.z < minOverlap) { minOverlap = overlap.z; pushAxis = 2; }
    if (pushAxis === -1 || minOverlap < 0.0001) return;
    pushVector.set(0, 0, 0);
    const pushMagnitude = minOverlap + 0.001;
    switch (pushAxis) {
      case 0:
        pushVector.x = (centerPlayer.x > centerObject.x) ? pushMagnitude : -pushMagnitude;
        if (Math.sign(this.player.velocity.x) === Math.sign(pushVector.x)) this.player.velocity.x = 0;
        break;
      case 1:
        pushVector.y = (centerPlayer.y > centerObject.y) ? pushMagnitude : -pushMagnitude;
        if (pushVector.y > 0.01 && this.player.velocity.y <= 0) {
          this.player.velocity.y = 0;
          this.player.isOnGround = true;
          this.player.canJump = true;
        } else if (pushVector.y < -0.01 && this.player.velocity.y > 0) {
          this.player.velocity.y = 0;
        }
        break;
      case 2:
        pushVector.z = (centerPlayer.z > centerObject.z) ? pushMagnitude : -pushMagnitude;
        if (Math.sign(this.player.velocity.z) === Math.sign(pushVector.z)) this.player.velocity.z = 0;
        break;
    }
    this.player.mesh!.position.add(pushVector);
  }
}

const targetPosition = new Vector3();
const offset = new Vector3();
const idealPosition = new Vector3();
const finalPosition = new Vector3();
const idealLookat = new Vector3();
const rayOrigin = new Vector3();

class ThirdPersonCamera {
  camera: PerspectiveCamera;
  target: Object3D;
  idealOffset: Vector3 = new Vector3(0, 2.5, 5.0);
  minOffsetDistance: number = 1.5;
  maxOffsetDistance: number = 12.0;
  pitchAngle: number = 0.15;
  minPitch: number = -Math.PI / 3;
  maxPitch: number = Math.PI / 2.5;
  pitchSensitivity: number = 0.0025;
  lerpAlphaPositionBase: number = 0.05;
  lerpAlphaLookatBase: number = 0.1;
  collisionRaycaster: Raycaster;
  collisionOffset: number = 0.3;
  currentPosition: Vector3;
  currentLookat: Vector3;

  constructor(camera: PerspectiveCamera, target: Object3D) {
    this.camera = camera;
    this.target = target;
    this.collisionRaycaster = new Raycaster();
    this.currentPosition = new Vector3();
    this.currentLookat = new Vector3();
    this.target.getWorldPosition(this.currentLookat);
    this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6;
    this.update(0.016, []);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }

  handleMouseInput(deltaX: number, deltaY: number): void {
    this.pitchAngle -= deltaY * this.pitchSensitivity;
    this.pitchAngle = MathUtils.clamp(this.pitchAngle, this.minPitch, this.maxPitch);
  }

  update(deltaTime: number, collidables: Object3D[]): void {
    if (!this.target) return;
    this.target.getWorldPosition(targetPosition);
    const targetQuaternion = this.target.quaternion;
    offset.copy(this.idealOffset)
      .applyAxisAngle(new Vector3(1, 0, 0), this.pitchAngle)
      .applyQuaternion(targetQuaternion);
    idealPosition.copy(targetPosition).add(offset);
    cameraDirection.copy(idealPosition).sub(targetPosition);
    let idealDistance = cameraDirection.length();
    cameraDirection.normalize();
    rayOrigin.copy(targetPosition).addScaledVector(cameraDirection, 0.2);
    this.collisionRaycaster.set(rayOrigin, cameraDirection);
    this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2);
    const collisionCheckObjects = collidables.filter(obj => obj !== this.target && obj?.userData?.isCollidable);
    const intersects = this.collisionRaycaster.intersectObjects(collisionCheckObjects, true);
    let actualDistance = idealDistance;
    if (intersects.length > 0) {
      actualDistance = intersects.reduce((minDist, intersect) => Math.min(minDist, intersect.distance), idealDistance) + 0.2 - this.collisionOffset;
      actualDistance = Math.max(this.minOffsetDistance, actualDistance);
    }
    actualDistance = MathUtils.clamp(actualDistance, this.minOffsetDistance, this.maxOffsetDistance);
    finalPosition.copy(targetPosition).addScaledVector(cameraDirection, actualDistance);
    const targetHeight = this.target.userData?.height ?? 1.8;
    idealLookat.copy(targetPosition).add(new Vector3(0, targetHeight * 0.6, 0));
    smoothVectorLerp(this.currentPosition, finalPosition, this.lerpAlphaPositionBase, deltaTime);
    smoothVectorLerp(this.currentLookat, idealLookat, this.lerpAlphaLookatBase, deltaTime);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }
}

type KeyCallback = () => void;
type MouseCallback = (event: MouseEvent) => void;

class Controls {
  player: Player | null;
  cameraController: ThirdPersonCamera | null;
  domElement: HTMLElement;
  keys: KeyState = {};
  mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
  isPointerLocked: boolean = false;
  playerRotationSensitivity: number = 0.0025;
  moveState: MoveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false };
  keyDownListeners: Record<string, KeyCallback[]> = {};
  mouseClickListeners: Record<number, MouseCallback[]> = {};
  boundOnKeyDown: (event: KeyboardEvent) => void;
  boundOnKeyUp: (event: KeyboardEvent) => void;
  boundOnMouseDown: (event: MouseEvent) => void;
  boundOnMouseUp: (event: MouseEvent) => void;
  boundOnMouseMove: (event: MouseEvent) => void;
  boundOnClick: (event: MouseEvent) => void;
  boundOnPointerLockChange: () => void;
  boundOnPointerLockError: () => void;

  constructor(player: Player | null, cameraController: ThirdPersonCamera | null, domElement: HTMLElement | null) {
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

  initListeners(): void {
    document.addEventListener('keydown', this.boundOnKeyDown, false);
    document.addEventListener('keyup', this.boundOnKeyUp, false);
    document.addEventListener('mousedown', this.boundOnMouseDown, false);
    document.addEventListener('mouseup', this.boundOnMouseUp, false);
    document.addEventListener('mousemove', this.boundOnMouseMove, false);
    this.domElement.addEventListener('click', this.boundOnClick, false);
    document.addEventListener('pointerlockchange', this.boundOnPointerLockChange, false);
    document.addEventListener('pointerlockerror', this.boundOnPointerLockError, false);
  }

  addKeyDownListener(keyCode: string, callback: KeyCallback): void {
    if (!this.keyDownListeners[keyCode]) this.keyDownListeners[keyCode] = [];
    this.keyDownListeners[keyCode].push(callback);
  }

  addMouseClickListener(buttonIndex: number, callback: MouseCallback): void {
    if (!this.mouseClickListeners[buttonIndex]) this.mouseClickListeners[buttonIndex] = [];
    this.mouseClickListeners[buttonIndex].push(callback);
  }

  lockPointer(): void {
    if ('requestPointerLock' in this.domElement && document.pointerLockElement !== this.domElement) {
      this.domElement.requestPointerLock();
    }
  }

  unlockPointer(): void {
    if (document.pointerLockElement === this.domElement) document.exitPointerLock();
  }

  onKeyDown(event: KeyboardEvent): void {
    const keyCode = event.code;
    if (this.keys[keyCode]) return;
    this.keys[keyCode] = true;
    this.keyDownListeners[keyCode]?.forEach(cb => cb());
    if (keyCode === 'Space') this.moveState.jump = true;
    if (keyCode === 'KeyE') this.moveState.interact = true;
    this.updateContinuousMoveState();
  }

  onKeyUp(event: KeyboardEvent): void {
    this.keys[event.code] = false;
    this.updateContinuousMoveState();
  }

  onMouseDown(event: MouseEvent): void {
    this.mouse.buttons[event.button] = true;
    this.mouseClickListeners[event.button]?.forEach(cb => cb(event));
  }

  onMouseUp(event: MouseEvent): void {
    this.mouse.buttons[event.button] = false;
  }

  onMouseMove(event: MouseEvent): void {
    if (this.isPointerLocked) {
      this.mouse.dx += event.movementX ?? 0;
      this.mouse.dy += event.movementY ?? 0;
    } else {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    }
  }

  onClick(event: MouseEvent): void {
    const gameIsPaused = (window as any).game?.isPaused ?? false;
    if (!this.isPointerLocked && !gameIsPaused) this.lockPointer();
  }

  onPointerLockChange(): void {
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

  onPointerLockError(): void {
    this.isPointerLocked = false;
  }

  updateContinuousMoveState(): void {
    const W = this.keys['KeyW'] || this.keys['ArrowUp'];
    const S = this.keys['KeyS'] || this.keys['ArrowDown'];
    const D = this.keys['KeyD'] || this.keys['ArrowRight'];
    const A = this.keys['KeyA'] || this.keys['ArrowLeft'];
    const Sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0);
    this.moveState.right = (D ? 1 : 0) - (A ? 1 : 0);
    this.moveState.sprint = Sprint ?? false;
  }

  update(deltaTime: number): void {
    if (!this.isPointerLocked) {
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      return;
    }
    if (this.player && Math.abs(this.mouse.dx) > 0) {
      const yawDelta = -this.mouse.dx * this.playerRotationSensitivity;
      this.player.mesh!.rotateY(yawDelta);
    }
    if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
      this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy);
    }
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }

  consumeInteraction(): boolean {
    if (!this.moveState.interact) return false;
    this.moveState.interact = false;
    return true;
  }
}

function createTerrain(size: number, segments: number = 150): Mesh {
  const simplexTerrain = new SimplexNoise();
  const geometry = new PlaneGeometry(size, size, segments, segments);
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
    let z = simplexTerrain.noise(x * noiseScale, y * noiseScale) * noiseStrength;
    const distanceToCenter = Math.sqrt(x * x + y * y);
    if (distanceToCenter < flattenRadius) {
      const flattenFactor = 1.0 - smoothstep(0, flattenRadius, distanceToCenter);
      z = MathUtils.lerp(z, z * (1.0 - flattenStrength), flattenFactor);
    }
    vertices[index + 2] = z;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const material = new MeshLambertMaterial({ color: 0x88B04B });
  const terrainMesh = new Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = "Terrain";
  terrainMesh.userData = { isTerrain: true, isCollidable: true, worldSize: size, segments };
  return terrainMesh;
}

function setupLighting(scene: Scene): void {
  const ambientLight = new AmbientLight(0xadc1d4, 0.6);
  scene.add(ambientLight);
  const directionalLight = new DirectionalLight(0xfff5e1, 0.9);
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
  const hemisphereLight = new HemisphereLight(0x87CEEB, 0x98FB98, 0.3);
  scene.add(hemisphereLight);
}

const treeTrunkMat = new MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new MeshLambertMaterial({ color: Colors.FOREST_GREEN });

function createTree(position: Vector3): Group {
  const trunkHeight = randomFloat(3, 5);
  const trunkRadius = randomFloat(0.3, 0.5);
  const foliageHeight = trunkHeight * 1.2 + randomFloat(0, 1);
  const foliageRadius = trunkRadius * 3 + randomFloat(0, 1.5);
  const treeGroup = new Group();
  treeGroup.name = "Tree";
  const trunkGeo = new CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8);
  const trunkMesh = new Mesh(trunkGeo, treeTrunkMat);
  trunkMesh.position.y = trunkHeight / 2;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  treeGroup.add(trunkMesh);
  const foliageGeo = new ConeGeometry(foliageRadius, foliageHeight, 6);
  const foliageMesh = new Mesh(foliageGeo, treeFoliageMat);
  foliageMesh.position.y = trunkHeight + foliageHeight / 3;
  foliageMesh.castShadow = true;
  treeGroup.add(foliageMesh);
  treeGroup.position.copy(position).setY(0);
  treeGroup.userData = {
    isCollidable: true,
    isInteractable: true,
    interactionType: 'gather',
    resource: 'wood',
    gatherTime: 3000,
    prompt: "Press E to gather Wood",
    isDepletable: true,
    respawnTime: 20000,
    entityReference: treeGroup,
    boundingBox: new Box3().setFromObject(treeGroup)
  };
  return treeGroup;
}

function createRock(position: Vector3, size: number): Group {
  const rockGroup = new Group();
  rockGroup.name = "Rock";
  const height = size * randomFloat(0.5, 1.0);
  const geo = new BoxGeometry(size, height, size * randomFloat(0.8, 1.2));
  const mesh = new Mesh(geo, rockMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.set(randomFloat(-0.1, 0.1) * Math.PI, randomFloat(0, 2) * Math.PI, randomFloat(-0.1, 0.1) * Math.PI);
  rockGroup.add(mesh);
  rockGroup.position.copy(position).setY(0);
  rockGroup.userData = {
    isCollidable: true,
    isInteractable: true,
    interactionType: 'gather',
    resource: 'stone',
    gatherTime: 4000,
    prompt: "Press E to gather Stone",
    isDepletable: true,
    respawnTime: 30000,
    entityReference: rockGroup,
    boundingBox: new Box3().setFromObject(rockGroup)
  };
  return rockGroup;
}

function createHerb(position: Vector3): Group {
  const herbGroup = new Group();
  herbGroup.name = "Herb Plant";
  const size = 0.25;
  const geo = new SphereGeometry(size, 5, 4);
  const mesh = new Mesh(geo, herbMat);
  mesh.castShadow = true;
  herbGroup.add(mesh);
  herbGroup.position.copy(position).setY(size);
  herbGroup.userData = {
    isCollidable: false,
    isInteractable: true,
    interactionType: 'gather',
    resource: 'herb',
    gatherTime: 1500,
    prompt: "Press E to gather Herb",
    isDepletable: true,
    respawnTime: 15000,
    entityReference: herbGroup,
    boundingBox: new Box3().setFromObject(herbGroup)
  };
  return herbGroup;
}

function populateEnvironment(scene: Scene, worldSize: number, collidableObjects: Object3D[], interactableObjects: Array<Entity | InteractableObject | Object3D>, entities: Array<Entity | Object3D>, inventory: Inventory, eventLog: EventLog): void {
  const halfSize = worldSize / 2;
  const terrain = scene.getObjectByName("Terrain") as Mesh;
  const getTerrainHeight = (x: number, z: number): number => {
    const raycaster = new Raycaster(new Vector3(x, 100, z), new Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(terrain);
    return intersects.length > 0 ? intersects[0].point.y : 0;
  };
  const villageCenter = new Vector3(5, 0, 10);
  const addNpc = (pos: Vector3, name: string, accessory: AccessoryType): NPC => {
    const npc = new NPC(scene, pos, name, accessory, inventory);
    npc.mesh!.position.y = getTerrainHeight(pos.x, pos.z);
    entities.push(npc);
    collidableObjects.push(npc.mesh!);
    interactableObjects.push(npc);
    return npc;
  };
  addNpc(villageCenter.clone().add(new Vector3(-12, 0, 2)), 'Farmer Giles', 'straw_hat');
  addNpc(villageCenter.clone().add(new Vector3(10, 0, -3)), 'Blacksmith Brynn', 'cap');
  addNpc(new Vector3(halfSize * 0.4, 0, -halfSize * 0.3), 'Hunter Rex', 'none');
  const addObject = (creator: (pos: Vector3, ...args: any[]) => Group, count: number, minDistSq: number, ...args: any[]) => {
  for (let i = 0; i < count; i++) {
    const x = randomFloat(-halfSize * 0.95, halfSize * 0.95);
    const z = randomFloat(-halfSize * 0.95, halfSize * 0.95);
    const distSq = (x - villageCenter.x) ** 2 + (z - villageCenter.z) ** 2;
    if (distSq < minDistSq) continue;
    const obj = creator(new Vector3(x, 0, z), ...args);
    const height = getTerrainHeight(x, z);
    obj.position.y = height;
    if (obj.name === "Herb Plant") obj.position.y = height + 0.1;
    scene.add(obj);
    if (obj.userData.isCollidable) collidableObjects.push(obj);
    if (obj.userData.isInteractable) interactableObjects.push(obj);
    entities.push(obj); // Add this line to include resources in entities
  }
  };
  addObject(createTree, 150, 25 * 25);
  addObject(createRock, 80, 20 * 20, randomFloat(1, 2.5));
  addObject(createHerb, 60, 10 * 10);
}

function createWorldBoundary(scene: Scene, worldSize: number, collidableObjects: Object3D[]): void {
  const thickness = 20;
  const height = 100;
  const halfSize = worldSize / 2;
  const boundaryMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.0, side: DoubleSide, visible: false });
  const createWall = (px: number, pz: number, sx: number, sz: number, name: string) => {
    const wallGeo = new BoxGeometry(sx, height, sz);
    const wallMesh = new Mesh(wallGeo, boundaryMaterial);
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
}

class HUD {
  player: Player;
  healthBarElement: HTMLElement | null;
  staminaBarElement: HTMLElement | null;

  constructor(player: Player) {
    this.player = player;
    this.healthBarElement = document.getElementById('health-bar');
    this.staminaBarElement = document.getElementById('stamina-bar');
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
    this.healthBarElement.style.backgroundColor = healthPercent < 30 ? '#FF4500' : healthPercent < 60 ? '#FFA500' : '#4CAF50';
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

class InventoryDisplay {
  inventory: Inventory;
  displayElement: HTMLElement | null;
  slotsContainer: HTMLElement | null;
  isOpen: boolean = false;
  boundUpdateDisplay: (items: Array<InventoryItem | null>) => void;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
    this.displayElement = document.getElementById('inventory-display');
    this.slotsContainer = document.getElementById('inventory-slots');
    if (this.slotsContainer) this.createSlots();
    this.boundUpdateDisplay = this.updateDisplay.bind(this);
    this.inventory.onChange(this.boundUpdateDisplay);
    if (this.displayElement) this.displayElement.classList.add('hidden');
  }

  createSlots(): void {
    this.slotsContainer!.innerHTML = '';
    for (let i = 0; i < this.inventory.size; i++) {
      const slotElement = document.createElement('div');
      slotElement.classList.add('inventory-slot');
      slotElement.dataset.index = i.toString();
      slotElement.title = 'Empty';
      slotElement.innerHTML = `<div class="item-icon" data-current-icon="empty" style="visibility: hidden;"></div><span class="item-count"></span>`;
      this.slotsContainer!.appendChild(slotElement);
    }
  }

  updateDisplay(items: Array<InventoryItem | null>): void {
    if (!this.isOpen || !this.slotsContainer) return;
    const slotElements = this.slotsContainer.querySelectorAll<HTMLElement>('.inventory-slot');
    if (slotElements.length !== this.inventory.size) this.createSlots();
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

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateDisplay(this.inventory.items);
    this.displayElement.classList.remove('hidden');
  }

  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add('hidden');
  }
}

class JournalDisplay {
  eventLog: EventLog;
  displayElement: HTMLElement | null;
  eventListElement: HTMLElement | null;
  isOpen: boolean = false;
  boundUpdateEvents: (entries: string[]) => void;

  constructor(eventLog: EventLog) {
    this.eventLog = eventLog;
    this.displayElement = document.getElementById('journal-display');
    this.eventListElement = document.getElementById('event-log');
    this.boundUpdateEvents = this.updateEvents.bind(this);
    this.eventLog.onChange(this.boundUpdateEvents);
    if (this.displayElement) this.displayElement.classList.add('hidden');
  }

  updateEvents(entries: string[]): void {
    if (!this.isOpen || !this.eventListElement) return;
    this.eventListElement.innerHTML = entries.length === 0 ? '<li>No events recorded yet.</li>' : '';
    entries.forEach(entryText => {
      const li = document.createElement('li');
      li.textContent = entryText;
      this.eventListElement!.appendChild(li);
    });
    this.eventListElement.scrollTop = this.eventListElement.scrollHeight;
  }

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateEvents(this.eventLog.getFormattedEntries());
    this.displayElement.classList.remove('hidden');
  }

  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add('hidden');
  }
}

class Minimap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  player: Player;
  entities: Array<Entity | Object3D>;
  worldSize: number;
  mapSize: number;
  mapScale: number;
  halfMapSize: number;
  halfWorldSize: number;
  bgColor: string = 'rgba(100, 100, 100, 0.6)';
  playerColor: string = 'yellow';
  npcColor: string = 'cyan';
  dotSize: number = 3;
  playerDotSize: number = 4;
  playerTriangleSize: number;
  entityPosition = new Vector3();
  playerPosition = new Vector3();

  constructor(canvasElement: HTMLCanvasElement | null, player: Player, entities: Array<Entity | Object3D>, worldSize: number) {
    this.canvas = canvasElement!;
    this.ctx = this.canvas.getContext('2d');
    this.player = player;
    this.entities = entities;
    this.worldSize = worldSize;
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
  this.player.mesh!.getWorldPosition(this.playerPosition);
  const playerRotationY = this.player.mesh!.rotation.y;
  this.ctx.save();
  this.ctx.translate(this.halfMapSize, this.halfMapSize);
  this.ctx.rotate(-playerRotationY);
  this.ctx.translate(-this.worldToMapX(this.playerPosition.x), -this.worldToMapZ(this.playerPosition.z));
  this.entities.forEach(entity => {
    if (!entity || entity === this.player || (entity instanceof Entity && entity.isDead)) return;
    const mesh = (entity instanceof Entity) ? entity.mesh : entity;
    if (!mesh || !mesh.parent || !mesh.visible) return;
    mesh.getWorldPosition(this.entityPosition);
    const entityMapX = this.worldToMapX(this.entityPosition.x);
    const entityMapY = this.worldToMapZ(this.entityPosition.z);
    let color = 'gray';
    let size = this.dotSize;
    let draw = false;
    if (entity.userData.resource) {
      switch (entity.userData.resource) {
        case 'wood':
          color = 'green';
          break;
        case 'stone':
          color = 'gray';
          break;
        case 'herb':
          color = 'lightgreen';
          break;
        default:
          color = 'white';
      }
      draw = true;
    } else if (entity instanceof NPC) {
      color = this.npcColor;
      size += 1;
      draw = true;
    }
    if (draw) this.drawDot(entityMapX, entityMapY, color, size);
  });
  this.ctx.restore();
  this.drawPlayerTriangle(this.halfMapSize, this.halfMapSize, this.playerColor, this.playerTriangleSize);
  }

  worldToMapX(worldX: number): number {
    return (worldX + this.halfWorldSize) * this.mapScale;
  }

  worldToMapZ(worldZ: number): number {
  return (this.halfWorldSize - worldZ) * this.mapScale; // Changed from (worldZ + this.halfWorldSize)
  }

  drawDot(mapX: number, mapY: number, color: string, size: number): void {
    this.ctx!.fillStyle = color;
    this.ctx!.beginPath();
    this.ctx!.arc(mapX, mapY, size, 0, Math.PI * 2);
    this.ctx!.fill();
  }

  drawPlayerTriangle(centerX: number, centerY: number, color: string, size: number): void {
    this.ctx!.fillStyle = color;
    this.ctx!.beginPath();
    this.ctx!.moveTo(centerX, centerY - size * 0.8); // Top vertex
    this.ctx!.lineTo(centerX - size / 2, centerY + size * 0.3); // Bottom-left
    this.ctx!.lineTo(centerX + size / 2, centerY + size * 0.3); // Bottom-right
    this.ctx!.closePath();
    this.ctx!.fill();
    
    
  }
}

const WORLD_SIZE = 100;
const TERRAIN_SEGMENTS = 150;

(window as any).game = null;

function getTerrainHeightGame(x: number, z: number): number {
  const game = (window as any).game as Game | null;
  const terrain = game?.scene?.getObjectByName("Terrain") as Mesh | undefined;
  if (!terrain) return 0;
  const raycaster = new Raycaster(new Vector3(x, 200, z), new Vector3(0, -1, 0));
  const intersects = raycaster.intersectObject(terrain);
  return intersects.length > 0 ? intersects[0].point.y : 0;
}

class Game {
  scene: Scene | null = null;
  renderer: WebGLRenderer | null = null;
  camera: PerspectiveCamera | null = null;
  clock: Clock | null = null;
  player: Player | null = null;
  thirdPersonCamera: ThirdPersonCamera | null = null;
  controls: Controls | null = null;
  physics: Physics | null = null;
  inventory: Inventory | null = null;
  eventLog: EventLog | null = null;
  interactionSystem: InteractionSystem | null = null;
  hud: HUD | null = null;
  minimap: Minimap | null = null;
  inventoryDisplay: InventoryDisplay | null = null;
  journalDisplay: JournalDisplay | null = null;
  entities: Array<Entity | Object3D> = [];
  collidableObjects: Object3D[] = [];
  interactableObjects: Array<Entity | InteractableObject | Object3D> = [];
  isPaused: boolean = false;

  constructor() {
    (window as any).game = this;
  }

  init(): void {
    this.clock = new Clock();
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initInventoryAndEventLog();
    this.initPlayer();
    this.initControls();
    this.initPhysics();
    this.initEnvironment();
    this.initSystems();
    this.initUI();
    this.setupUIControls();
    this.eventLog!.addEntry("Welcome! Click window to lock controls. [I] Inventory, [J] Journal, [E] Interact, [Esc] Unlock/Close UI");
  }

  initRenderer(): void {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    document.getElementById('game-container')?.appendChild(this.renderer.domElement);
  }

  initScene(): void {
    this.scene = new Scene();
    this.scene.background = new Color(0x87CEEB);
    this.scene.fog = new Fog(0x87CEEB, 150, 600);
    setupLighting(this.scene);
    const terrain = createTerrain(WORLD_SIZE, TERRAIN_SEGMENTS);
    this.scene.add(terrain);
    this.collidableObjects.push(terrain);
    createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);
  }

  initCamera(): void {
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  }

  initInventoryAndEventLog(): void {
    this.inventory = new Inventory(24);
    this.eventLog = new EventLog(75);
  }

  initPlayer(): void {
    const playerSpawnPos = new Vector3(0, 0, 5);
    playerSpawnPos.y = getTerrainHeightGame(playerSpawnPos.x, playerSpawnPos.z) + 0.5;
    this.player = new Player(this.scene!, playerSpawnPos);
    this.entities.push(this.player);
    this.collidableObjects.push(this.player.mesh!);
    this.player.setEventLog(this.eventLog!);
  }

  initControls(): void {
    this.thirdPersonCamera = new ThirdPersonCamera(this.camera!, this.player!.mesh!);
    this.controls = new Controls(this.player, this.thirdPersonCamera, this.renderer!.domElement);
  }

  initPhysics(): void {
    this.physics = new Physics(this.player!, this.collidableObjects);
  }

  initEnvironment(): void {
    populateEnvironment(this.scene!, WORLD_SIZE, this.collidableObjects, this.interactableObjects, this.entities, this.inventory!, this.eventLog!);
  }

  initSystems(): void {
    this.interactionSystem = new InteractionSystem(this.player!, this.camera!, this.interactableObjects, this.controls!, this.inventory!, this.eventLog!);
  }

  initUI(): void {
    this.hud = new HUD(this.player!);
    this.minimap = new Minimap(document.getElementById('minimap-canvas') as HTMLCanvasElement, this.player!, this.entities, WORLD_SIZE);
    this.inventoryDisplay = new InventoryDisplay(this.inventory!);
    this.journalDisplay = new JournalDisplay(this.eventLog!);
  }

  setupUIControls(): void {
    this.controls!.addKeyDownListener('KeyI', () => {
      this.journalDisplay!.hide();
      this.inventoryDisplay!.toggle();
      this.setPauseState(this.inventoryDisplay!.isOpen);
    });
    this.controls!.addKeyDownListener('KeyJ', () => {
      this.inventoryDisplay!.hide();
      this.journalDisplay!.toggle();
      this.setPauseState(this.journalDisplay!.isOpen);
    });
    this.controls!.addKeyDownListener('Escape', () => {
      if (this.inventoryDisplay!.isOpen) {
        this.inventoryDisplay!.hide();
        this.setPauseState(false);
      } else if (this.journalDisplay!.isOpen) {
        this.journalDisplay!.hide();
        this.setPauseState(false);
      } else if (this.controls!.isPointerLocked) {
        this.controls!.unlockPointer();
      }
    });
    this.controls!.addMouseClickListener(0, (event: MouseEvent) => {
      if (this.inventoryDisplay!.isOpen) this.handleInventoryClick(event);
    });
  }

  handleInventoryClick(event: MouseEvent): void {
    const slotElement = (event.target as HTMLElement)?.closest('.inventory-slot') as HTMLElement | null;
    if (!slotElement) return;
    const index = parseInt(slotElement.dataset.index ?? '-1', 10);
    if (index === -1) return;
    const item = this.inventory!.getItem(index);
    if (!item) return;
    if (item.name === 'Health Potion') {
      if (this.player!.health < this.player!.maxHealth) {
        this.player!.heal(25);
        if (this.inventory!.removeItemByIndex(index, 1)) this.eventLog!.addEntry(`Used a Health Potion. Ahh, refreshing!`);
      } else {
        this.eventLog!.addEntry(`Your health is already full.`);
      }
    } else {
      this.eventLog!.addEntry(`You examine the ${item.name}.`);
    }
    event.stopPropagation();
  }

  setPauseState(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    if (this.isPaused) {
      this.controls!.unlockPointer();
    } else if (!this.inventoryDisplay!.isOpen && !this.journalDisplay!.isOpen) {
      this.controls!.lockPointer();
    }
  }

  start(): void {
    if (!this.renderer || !this.clock) return;
    this.renderer.setAnimationLoop(this.update.bind(this));
  }

  update(): void {
    if (!this.clock || !this.renderer || !this.scene || !this.camera || !this.player) return;
    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    this.controls!.update(deltaTime);
    if (!this.isPaused) {
      this.player.update(deltaTime, this.controls!.moveState, this.collidableObjects);
      this.physics!.update(deltaTime);
      this.entities.forEach(entity => {
        if (entity !== this.player && typeof (entity as any).update === 'function') {
          (entity as any).update(deltaTime, this.player);
        }
      });
      this.interactionSystem!.update(deltaTime);
      this.thirdPersonCamera!.update(deltaTime, this.collidableObjects);
      if (this.player.isDead) this.respawnPlayer();
    }
    this.hud!.update();
    this.minimap!.update();
    this.renderer.render(this.scene, this.camera);
  }

  respawnPlayer(): void {
    this.eventLog!.addEntry("You blacked out and woke up back near the village...");
    const goldCount = this.inventory!.countItem('gold');
    const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1));
    if (goldPenalty > 0) {
      this.inventory!.removeItem('gold', goldPenalty);
      this.eventLog!.addEntry(`You lost ${goldPenalty} gold.`);
    }
    const respawnPos = new Vector3(0, 0, 10);
    respawnPos.y = getTerrainHeightGame(respawnPos.x, respawnPos.z) + 0.5;
    this.player!.respawn(respawnPos);
    this.setPauseState(false);
    this.interactionSystem!.cancelGatherAction();
  }

  onWindowResize(): void {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }
}

if (WebGL.isWebGL2Available()) {
  const gameInstance = new Game();
  gameInstance.init();
  gameInstance.start();
  const onResize = () => gameInstance.onWindowResize();
  window.addEventListener('resize', onResize, false);
  window.addEventListener('beforeunload', () => window.removeEventListener('resize', onResize));
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById('game-container')?.appendChild(warning);
}