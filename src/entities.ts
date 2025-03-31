// src/entities.ts
import {
  Scene, Vector3, Box3, Quaternion, Group, Mesh, Material, Object3D, Matrix4,
  AnimationMixer, AnimationClip, AnimationAction, LoopOnce, LoopRepeat
} from 'three';
import { EventLog, Inventory, EntityUserData, UpdateOptions, smoothQuaternionSlerp, getNextEntityId, MoveState, getTerrainHeight } from './ultils';
import { Raycaster } from 'three';

export class Entity {
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
    this.id = `${name}_${getNextEntityId()}`;
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

  update(deltaTime: number, options: UpdateOptions = {}): void {
  }

  updateBoundingBox(): void {
    if (!this.mesh) return;
    const height = this.userData.height ?? 1.8;
    const radius = this.userData.radius ?? 0.4;
    const center = this.mesh.position.clone().add(new Vector3(0, height / 2, 0));
    const size = new Vector3(radius * 2, height, radius * 2);
    this.boundingBox.setFromCenterAndSize(center, size);
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

export class Player extends Entity {
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
  eventLog: EventLog | null = null;
  mixer: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  jumpAction?: AnimationAction;
  attackAction?: AnimationAction; // Added attack action
  isGathering: boolean = false; // Added for gathering state
  isAttacking: boolean = false;
  gatherAttackTimer: number = 0; // Timer for periodic attack animation
  private gatherAttackInterval: number = 1.0; // Interval between attack animations (seconds)
  private attackTriggered: boolean = false; // Flag to detect attack key press
  private groundCheckOrigin = new Vector3();
  private groundCheckDirection = new Vector3(0, -1, 0);
  

  constructor(scene: Scene, position: Vector3, model: Group, animations: AnimationClip[]) {
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
    this.moveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false, attack: false };
    this.gravity = -25;
    this.isOnGround = false;
    this.groundCheckDistance = 0.15;
    this.lastVelocityY = 0;

    // Scale and position the GLTF model
    const box = new Box3().setFromObject(model);
    const currentHeight = box.max.y - box.min.y;
    const scale = PLAYER_HEIGHT / currentHeight;
    model.scale.set(scale, scale, scale);
    model.position.y = -box.min.y * scale;
    this.mesh!.add(model);

    // Set up animations
    this.mixer = new AnimationMixer(model);
    const walkAnim = animations.find(anim => anim.name.toLowerCase().includes('walk'));
    const runAnim = animations.find(anim => anim.name.toLowerCase().includes('run'));
    const jumpAnim = animations.find(anim => anim.name.toLowerCase().includes('jump'));
    const attackAnim = animations.find(anim => anim.name.toLowerCase().includes('attack')); // Load attack animation
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    if (jumpAnim) {
      this.jumpAction = this.mixer.clipAction(jumpAnim);
      this.jumpAction.setLoop(LoopOnce, 1);
      this.jumpAction.clampWhenFinished = true;
    }
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1); // Attack is a one-time action
      this.attackAction.clampWhenFinished = true;
    }
    if (this.idleAction) this.idleAction.play();

    this.userData.height = PLAYER_HEIGHT;
    this.userData.radius = PLAYER_RADIUS;
    this.updateBoundingBox();
    
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.attackAction) {
        this.isAttacking = false;
        // Resume the appropriate animation based on movement
        const isMoving = Math.abs(this.moveState.forward) > 0.1 || Math.abs(this.moveState.right) > 0.1;
        if (isMoving) {
          if (this.isSprinting && this.runAction) {
            this.runAction.play();
          } else if (this.walkAction) {
            this.walkAction.play();
          }
        } else {
          if (this.idleAction) this.idleAction.play();
        }
      }
    });
  }

  setEventLog(eventLog: EventLog): void {
    this.eventLog = eventLog;
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) return;
    const { moveState, collidables } = options;
    if (!moveState || !collidables) {
      console.warn('Missing moveState or collidables for Player update');
      return;
    }
    this.moveState = moveState;

    // Handle stamina, gravity, and movement
    this.handleStamina(deltaTime);
    if (!this.isAttacking && !this.isGathering) {
      this.handleMovement(deltaTime); // Only move if not attacking or gathering
    } else {
      // Stop horizontal movement during attack or gather
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    this.applyGravity(deltaTime);
    this.mesh!.position.x += this.velocity.x * deltaTime;
    this.mesh!.position.z += this.velocity.z * deltaTime;
    this.checkGround(collidables);
    this.mesh!.position.y += this.velocity.y * deltaTime;

    // Trigger attack when 'F' is pressed
    if (moveState.attack && !this.attackTriggered) {
      this.attackTriggered = true;
      this.triggerAttack();
    } else if (!moveState.attack) {
      this.attackTriggered = false;
    }

    // Handle gathering attack animation (already working)
    if (this.isGathering) {
      this.gatherAttackTimer += deltaTime;
      if (this.gatherAttackTimer >= this.gatherAttackInterval) {
        this.gatherAttackTimer = 0;
        if (this.attackAction) {
          this.attackAction.reset().play();
        }
      }
    }

    this.lastVelocityY = this.velocity.y;
    this.updateAnimations(deltaTime);
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
    forward.set(0, 0, 1).applyQuaternion(this.mesh!.quaternion);
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
      this.moveState.jump = false;
      if (this.jumpAction) {
        this.jumpAction.reset().play();
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
    this.groundCheckOrigin.copy(this.mesh!.position).add(new Vector3(0, 0.1, 0));
    const rayLength = 0.1 + this.groundCheckDistance;
    const raycaster = new Raycaster(this.groundCheckOrigin, this.groundCheckDirection, 0, rayLength);
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

  updateAnimations(deltaTime: number): void {
    this.mixer.update(deltaTime);

    if (this.isGathering) {
      // Existing gathering logic (already works)
      if (this.idleAction) this.idleAction.play();
      // Attack animation is triggered periodically in update()
    } else if (!this.isAttacking) {
      // Only update movement animations if not attacking
      const isMoving = Math.abs(this.moveState.forward) > 0.1 || Math.abs(this.moveState.right) > 0.1;
      if (isMoving) {
        if (this.isSprinting && this.runAction) {
          this.runAction.play();
          if (this.walkAction) this.walkAction.stop();
          if (this.idleAction) this.idleAction.stop();
        } else if (this.walkAction) {
          this.walkAction.play();
          if (this.runAction) this.runAction.stop();
          if (this.idleAction) this.idleAction.stop();
        }
      } else {
        if (this.idleAction) this.idleAction.play();
        if (this.walkAction) this.walkAction.stop();
        if (this.runAction) this.runAction.stop();
      }
    }
      // Jump animation is triggered in handleMovement
    }
  

  triggerAttack(): void {
    if (this.attackAction) {
      this.isAttacking = true; // Set attack state
      // Stop all movement animations
      if (this.walkAction) this.walkAction.stop();
      if (this.runAction) this.runAction.stop();
      if (this.idleAction) this.idleAction.stop();
      this.attackAction.reset().play(); // Play attack animation
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
    this.isGathering = false; // Reset gathering state
    this.gatherAttackTimer = 0; // Reset timer
    this.eventLog?.addEntry("You feel slightly disoriented but alive.");
    this.updateBoundingBox();
  }
}

export class NPC extends Entity {
  inventory: Inventory | null;
  dialogueState: 'idle' | 'greeting';
  interactionPrompt: string;
  idleTimer: number;
  idleLookTarget: Vector3;
  baseQuaternion: Quaternion;
  baseForward: Vector3;
  mixer: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  jumpAction?: AnimationAction;
  attackAction?: AnimationAction;
  private gatherAttackTimer: number = 0;
  private gatherAttackInterval: number = 1.0; // Seconds between attack animations
  private playerPosition = new Vector3();
  private targetLookAt = new Vector3();
  private targetDirection = new Vector3();
  private targetQuaternion = new Quaternion();
  private lookAtMatrix = new Matrix4();

  // AI properties
  state: string = 'idle';
  homePosition: Vector3;
  roamRadius: number = 10;
  moveSpeed: number = 2;
  destination: Vector3 | null = null;
  targetResource: Object3D | null = null;
  gatherTimer: number = 0;
  gatherDuration: number = 0;
  actionTimer: number = 5;
  interactionDistance: number = 3;
  searchRadius: number = 120;

  constructor(scene: Scene, position: Vector3, name: string, model: Group, animations: AnimationClip[], inventory: Inventory | null) {
    super(scene, position, name);
    this.userData.isNPC = true;
    this.userData.isInteractable = true;
    this.userData.interactionType = 'talk';
    this.inventory = inventory;
    this.dialogueState = 'idle';
    this.interactionPrompt = `Press E to talk to ${this.name}`;
    this.userData.prompt = this.interactionPrompt;

    // Scale and position the GLTF model
    const box = new Box3().setFromObject(model);
    const currentHeight = box.max.y - box.min.y;
    const scale = 1.7 / currentHeight;
    model.scale.set(scale, scale, scale);
    model.position.y = -box.min.y * scale;
    this.mesh!.add(model);

    // Set up animations
    this.mixer = new AnimationMixer(model);
    const idleAnim = animations.find(anim => anim.name.toLowerCase().includes('idle'));
    const walkAnim = animations.find(anim => anim.name.toLowerCase().includes('walk'));
    const runAnim = animations.find(anim => anim.name.toLowerCase().includes('run'));
    const jumpAnim = animations.find(anim => anim.name.toLowerCase().includes('jump'));
    const attackAnim = animations.find(anim => anim.name.toLowerCase().includes('attack'));
    if (idleAnim) this.idleAction = this.mixer.clipAction(idleAnim);
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    if (jumpAnim) {
      this.jumpAction = this.mixer.clipAction(jumpAnim);
      this.jumpAction.setLoop(LoopOnce, 1);
      this.jumpAction.clampWhenFinished = true;
    }
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
    }
    if (this.idleAction) this.idleAction.play();

    this.userData.height = 1.7;
    this.userData.radius = 0.4;
    this.idleTimer = 2 + Math.random() * 3;
    this.idleLookTarget = new Vector3();
    this.mesh!.updateMatrixWorld();
    this.baseQuaternion = this.mesh!.quaternion.clone();
    this.baseForward = new Vector3(0, 0, 1).applyQuaternion(this.baseQuaternion);
    this.idleLookTarget.copy(this.mesh!.position).addScaledVector(this.baseForward, 5);
    this.homePosition = position.clone();
    this.updateBoundingBox();
  }
  
  updateAI(deltaTime: number, options: UpdateOptions = {}): void {
    const { player } = options;
    if (!player || !this.scene) return;

    // Check if player is within interaction distance
    const distanceToPlayer = this.mesh!.position.distanceTo(player.mesh.position);
    if (distanceToPlayer < this.interactionDistance) {
      if (this.state !== 'interacting') {
        this.state = 'interacting';
        this.velocity.set(0, 0, 0);
        this.destination = null;
        this.targetResource = null;
      }
      this.lookAt(player.mesh.position);
    } else {
      if (this.state === 'interacting') {
        this.state = 'idle';
      }
      // Handle NPC behavior based on state
      switch (this.state) {
        case 'idle':
          this.handleIdle(deltaTime);
          break;
        case 'roaming':
          this.handleRoaming(deltaTime);
          break;
        case 'movingToResource':
          this.handleMovingToResource(deltaTime);
          break;
        case 'gathering':
          this.handleGathering(deltaTime);
          break;
      }
    }

    // Handle idle looking behavior
    if (this.state === 'idle') {
      this.idleTimer -= deltaTime;
      if (this.idleTimer <= 0) {
        this.idleTimer = 3 + Math.random() * 4;
        const distanceToPlayerSq = this.mesh!.position.distanceToSquared(player.mesh.position);
        if (distanceToPlayerSq < 15 * 15 && Math.random() < 0.3) {
          this.targetLookAt.copy(player.mesh.position).setY(this.mesh!.position.y);
          this.idleLookTarget.copy(this.targetLookAt);
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
      // Smoothly rotate towards idleLookTarget
      const targetDirection = this.idleLookTarget.clone().sub(this.mesh!.position);
      targetDirection.y = 0;
      if (targetDirection.lengthSq() > 0.01) {
        targetDirection.normalize();
        const targetLookAt = this.mesh!.position.clone().add(targetDirection);
        const lookAtMatrix = new Matrix4().lookAt(targetLookAt, this.mesh!.position, this.mesh!.up);
        const targetQuaternion = new Quaternion().setFromRotationMatrix(lookAtMatrix);
        smoothQuaternionSlerp(this.mesh!.quaternion, targetQuaternion, 0.05, deltaTime);
      }
    }
  }

  private handleIdle(deltaTime: number): void {
    this.actionTimer -= deltaTime;
    if (this.actionTimer <= 0) {
      this.actionTimer = 5 + Math.random() * 5; // Reset timer between 5-10 seconds
      // Search for nearby gatherable resources
      const resources = this.scene!.children.filter(child =>
        child.userData.isInteractable &&
        child.userData.interactionType === 'gather' &&
        child.visible &&
        this.mesh!.position.distanceTo(child.position) < this.searchRadius
      ) as Object3D[];
      if (resources.length > 0) {
        // Find the closest resource
        const closestResource = resources.reduce((closest, current) => {
          const distCurrent = this.mesh!.position.distanceTo(current.position);
          const distClosest = this.mesh!.position.distanceTo(closest.position);
          return distCurrent < distClosest ? current : closest;
        });
        this.targetResource = closestResource;
        this.state = 'movingToResource';
      } else {
        // Roam to a random point within roamRadius
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.roamRadius;
        const offset = new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
        this.destination = this.homePosition.clone().add(offset);
        this.state = 'roaming';
      }
    }
  }

  private handleRoaming(deltaTime: number): void {
    if (!this.destination) {
      this.state = 'idle';
      return;
    }
    const direction = this.destination.clone().sub(this.mesh!.position);
    direction.y = 0;
    const distance = direction.length();
    if (distance < 0.5) {
      this.velocity.set(0, 0, 0);
      this.state = 'idle';
      return;
    }
    direction.normalize();
    this.velocity.copy(direction).multiplyScalar(this.moveSpeed);
    this.mesh!.position.addScaledVector(this.velocity, deltaTime);
    this.mesh!.position.y = getTerrainHeight(this.scene!, this.mesh!.position.x, this.mesh!.position.z);
    this.lookAt(this.destination);
    this.updateBoundingBox();
  }

  private handleMovingToResource(deltaTime: number): void {
    if (!this.targetResource || !this.targetResource.visible || !this.targetResource.userData.isInteractable) {
      this.targetResource = null;
      this.state = 'idle';
      return;
    }
    const direction = this.targetResource.position.clone().sub(this.mesh!.position);
    direction.y = 0;
    const distance = direction.length();
    if (distance < 1) {
      this.velocity.set(0, 0, 0);
      this.lookAt(this.targetResource.position);
      this.state = 'gathering';
      this.gatherTimer = 0;
      this.gatherDuration = this.targetResource.userData.gatherTime || 3000;
      return;
    }
    direction.normalize();
    this.velocity.copy(direction).multiplyScalar(this.moveSpeed);
    this.mesh!.position.addScaledVector(this.velocity, deltaTime);
    this.mesh!.position.y = getTerrainHeight(this.scene!, this.mesh!.position.x, this.mesh!.position.z);
    this.lookAt(this.targetResource.position);
    this.updateBoundingBox();
  }

  private handleGathering(deltaTime: number): void {
    if (!this.targetResource || !this.targetResource.visible || !this.targetResource.userData.isInteractable) {
      this.targetResource = null;
      this.state = 'idle';
      return;
    }
    this.gatherTimer += deltaTime * 1000; // Convert to milliseconds
    if (this.gatherTimer >= this.gatherDuration) {
      const resourceName = this.targetResource.userData.resource;
      if (resourceName && this.inventory) {
        this.inventory.addItem(resourceName, 1); // Add resource to inventory
      }
      // Handle resource depletion if applicable
      if (this.targetResource.userData.isDepletable) {
        this.targetResource.visible = false;
        this.targetResource.userData.isInteractable = false;
        const respawnTime = this.targetResource.userData.respawnTime || 15000;
        setTimeout(() => {
          if (this.targetResource) {
            this.targetResource.visible = true;
            this.targetResource.userData.isInteractable = true;
          }
        }, respawnTime);
      }
      this.targetResource = null;
      this.state = 'idle';
    }
  }


  interact(player: Player): { type: string; text: string; state: string } | null {
    this.playerPosition.copy(player.mesh!.position);
    this.playerPosition.y = this.mesh!.position.y;
    this.mesh!.lookAt(this.playerPosition);
    this.idleLookTarget.copy(this.playerPosition);
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

  update(deltaTime: number, options: UpdateOptions = {}): void {
    const { player } = options;
    if (!player) {
      console.warn('Missing player for NPC update');
      return;
    }
    if (!(player instanceof Player)) {
      console.warn('Provided player is not an instance of Player for NPC update');
      return;
    }
    // Animation and mixer updates will be added in Task 2
    this.updateAI(deltaTime, options);
  }
}

