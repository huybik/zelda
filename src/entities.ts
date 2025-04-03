// File: /src/entities.ts
import {
  Scene,
  Vector3,
  Box3,
  Quaternion,
  Group,
  Mesh,
  Material,
  Object3D,
  Matrix4,
  AnimationMixer,
  AnimationClip,
  AnimationAction,
  LoopOnce,
  Sprite,
  CanvasTexture,
  SpriteMaterial,
  Camera,
} from "three";
import {
  EntityUserData,
  UpdateOptions,
  MoveState,
  InteractionResult,
  EventEntry,
} from "./core/types";
import {
  smoothQuaternionSlerp,
  getTerrainHeight,
} from "./core/utils";
import { EventLog } from "./core/EventLog";
import { Inventory } from "./core/Inventory";
import {
  Colors,
  getNextEntityId,
  CHARACTER_HEIGHT,
  CHARACTER_RADIUS,
  CHARACTER_MAX_HEALTH,
  CHARACTER_MAX_STAMINA,
  CHARACTER_WALK_SPEED,
  CHARACTER_RUN_SPEED,
  CHARACTER_JUMP_FORCE,
  CHARACTER_STAMINA_DRAIN_RATE,
  CHARACTER_STAMINA_REGEN_RATE,
  CHARACTER_STAMINA_JUMP_COST,
  CHARACTER_EXHAUSTION_THRESHOLD,
  CHARACTER_GRAVITY,
  CHARACTER_GROUND_CHECK_DISTANCE,
  CHARACTER_GATHER_ATTACK_INTERVAL,
  AI_SEARCH_RADIUS,
  AI_ROAM_RADIUS,
  CHARACTER_ATTACK_RANGE,
  CHARACTER_PLAYER_ATTACK_DAMAGE,
  CHARACTER_NPC_ATTACK_DAMAGE,
  CHARACTER_SELF_HEAL_AMOUNT,
} from "./core/constants";

import { Raycaster } from "three";
import type { Game } from "./main";
import { AIController } from "./ai";
import { not } from "three/src/nodes/TSL.js";

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
  game: Game | null = null;
  aiController: AIController | null = null;
  rayCaster: Raycaster | null = null;

  constructor(scene: Scene, position: Vector3, name: string = "Entity") {
    this.id = `${name}_${getNextEntityId()}`;
    this.scene = scene;
    this.name = name;
    this.mesh = new Group();
    this.mesh.position.copy(position);
    this.velocity = new Vector3();
    this.boundingBox = new Box3();
    this.health = CHARACTER_MAX_HEALTH;
    this.maxHealth = CHARACTER_MAX_HEALTH;
    this.isDead = false;

    this.userData = {
      entityReference: this,
      isEntity: true,
      isPlayer: false,
      isNPC: false,
      isCollidable: false,
      isInteractable: false,
      id: this.id,
    };
    this.rayCaster = new Raycaster();
    if (this.mesh) {
      this.mesh.userData = this.userData;
      this.mesh.name = this.name;
      this.scene.add(this.mesh);
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {}

  updateBoundingBox(): void {
    if (!this.mesh) return;
    const height = this.userData.height ?? CHARACTER_HEIGHT;
    const radius = this.userData.radius ?? CHARACTER_RADIUS;
    const center = this.mesh.position
      .clone()
      .add(new Vector3(0, height / 2, 0));
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

  takeDamage(amount: number, attacker: Entity | null = null): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.game) {
      // Log damage taken
      const message = `${this.name} took ${amount} damage${
        attacker ? ` from ${attacker.name}` : ""
      }.`;
      this.game.logEvent(
        this,
        "take_damage",
        message,
        attacker || undefined,
        { damage: amount },
        this.mesh!.position
      );
    }
    if (this.health <= 0) this.die(attacker);
  }

  heal(amount: number): void {
    if (this.isDead || amount <= 0 || this.health >= this.maxHealth) return;
    const actualHeal = Math.min(amount, this.maxHealth - this.health);
    this.health += actualHeal;
    // Logging for heal is handled by the healer (e.g., AIController, selfHeal, or an external ability)
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;
    this.isDead = true;
    this.velocity.set(0, 0, 0);
    this.health = 0;
    this.userData.isCollidable = false;
    this.userData.isInteractable = false;
    if (this.aiController) this.aiController.aiState = "dead";
    this.game?.entityDisplayManager?.removeEntity(this);
  }

  destroy(): void {
    this.game?.entityDisplayManager?.removeEntity(this);
    if (!this.mesh || !this.scene) return;
    this.mesh.traverse((child) => {
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

// Define Character States
export type CharacterState = 
  | 'Idle'
  | 'Walking'
  | 'Running'
  | 'Jumping'
  | 'Falling'
  | 'Attacking'
  | 'Healing'
  | 'Gathering'
  // | 'Interacting' // Optional future state
  | 'Dead';

export class Character extends Entity {
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
  eventLog: EventLog;
  mixer: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  jumpAction?: AnimationAction;
  attackAction?: AnimationAction;
  gatherAttackTimer: number = 0;
  gatherAttackInterval: number;
  searchRadius: number;
  roamRadius: number;
  attackTriggered: boolean = false;
  inventory: Inventory | null;
  game: Game | null = null;
  persona: string = "";
  aiController: AIController | null = null;
  currentAction?: AnimationAction;
  currentState: CharacterState = 'Idle';

  private groundCheckOrigin = new Vector3();
  private groundCheckDirection = new Vector3(0, -1, 0);

  constructor(
    scene: Scene,
    position: Vector3,
    name: string,
    model: Group,
    animations: AnimationClip[],
    inventory: Inventory | null
  ) {
    super(scene, position, name);
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;
    this.userData.interactionType = "talk";
    this.userData.isNPC = true;
    this.maxHealth = CHARACTER_MAX_HEALTH;
    this.health = this.maxHealth;
    this.maxStamina = CHARACTER_MAX_STAMINA;
    this.stamina = this.maxStamina;
    this.walkSpeed = CHARACTER_WALK_SPEED;
    this.runSpeed = CHARACTER_RUN_SPEED;
    this.jumpForce = CHARACTER_JUMP_FORCE;
    this.staminaDrainRate = CHARACTER_STAMINA_DRAIN_RATE;
    this.staminaRegenRate = CHARACTER_STAMINA_REGEN_RATE;
    this.staminaJumpCost = CHARACTER_STAMINA_JUMP_COST;
    this.canJump = false;
    this.isSprinting = false;
    this.isExhausted = false;
    this.exhaustionThreshold = CHARACTER_EXHAUSTION_THRESHOLD;
    this.moveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false,
      attack: false,
    };
    this.gravity = CHARACTER_GRAVITY;
    this.isOnGround = false;
    this.groundCheckDistance = CHARACTER_GROUND_CHECK_DISTANCE;
    this.lastVelocityY = 0;
    this.inventory = inventory;
    this.eventLog = new EventLog(50);
    this.gatherAttackInterval = CHARACTER_GATHER_ATTACK_INTERVAL;
    this.searchRadius = AI_SEARCH_RADIUS;
    this.roamRadius = AI_ROAM_RADIUS;
    const box = new Box3().setFromObject(model);
    const currentHeight = box.max.y - box.min.y;
    const scale = CHARACTER_HEIGHT / currentHeight;
    model.scale.set(scale, scale, scale);
    model.position.y = -box.min.y * scale;
    this.mesh!.add(model);
    this.mixer = new AnimationMixer(model);
    const idleAnim = animations.find(
      (anim) => anim.name.toLowerCase().includes("idled") // idled not idle
    );
    if (idleAnim) this.idleAction = this.mixer.clipAction(idleAnim);
    const walkAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("walk")
    );
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    const runAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("run")
    );
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    const jumpAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("jump")
    );
    if (jumpAnim) {
      this.jumpAction = this.mixer.clipAction(jumpAnim);
      this.jumpAction.setLoop(LoopOnce, 1);
      this.jumpAction.clampWhenFinished = true;
    }
    const attackAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("attack")
    );
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
    }
    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;
    this.updateBoundingBox();
    this.switchState('Idle', true);

    this.mixer.addEventListener("finished", (e) => {
       this.handleAnimationFinished(e.action);
    });

    if (this.userData.isNPC) {
      this.aiController = new AIController(this);
    }
  }

  switchState(newState: CharacterState, force: boolean = false): void {
    if (this.currentState === newState && !force) return;

    const oldState = this.currentState;

    switch (oldState) {
        case 'Running':
            this.isSprinting = false;
            break;
        case 'Gathering':
            this.gatherAttackTimer = 0;
            break;
        case 'Attacking':
        case 'Healing':
            break;
    }

    this.currentState = newState;

    let targetAnimation: AnimationAction | undefined;
    switch (newState) {
        case 'Idle':
            targetAnimation = this.idleAction;
            this.velocity.x = 0;
            this.velocity.z = 0;
            this.isSprinting = false;
            break;
        case 'Walking':
            targetAnimation = this.walkAction;
            this.isSprinting = false;
            break;
        case 'Running':
            targetAnimation = this.runAction;
            this.isSprinting = true;
            break;
        case 'Jumping':
            targetAnimation = this.jumpAction;
            this.isSprinting = false;
            break;
        case 'Falling':
            targetAnimation = this.idleAction;
            this.isSprinting = false;
            break;
        case 'Attacking':
            targetAnimation = this.attackAction;
            this.velocity.x = 0;
            this.velocity.z = 0;
            targetAnimation?.reset().play();
            break;
        case 'Healing':
            targetAnimation = this.attackAction;
            this.velocity.x = 0;
            this.velocity.z = 0;
            targetAnimation?.reset().play();
            break;
        case 'Gathering':
            targetAnimation = this.idleAction;
            this.velocity.x = 0;
            this.velocity.z = 0;
            break;
        case 'Dead':
            this.currentAction?.stop();
            targetAnimation = undefined;
            this.velocity.set(0,0,0);
            this.isSprinting = false;
            this.isExhausted = false;
            break;
    }

    this.switchAnimation(targetAnimation, force);
  }

  switchAnimation(newAnimation: AnimationAction | undefined, force: boolean = false): void {
    if (newAnimation === this.currentAction && !force) {
      if (newAnimation && !newAnimation.isRunning()) newAnimation.play();
      return;
    }

    const fadeDuration = force ? 0 : 0.2;

    if (this.currentAction) {
      this.currentAction.fadeOut(fadeDuration);
    }

    if (newAnimation) {
        if (newAnimation === this.jumpAction || newAnimation === this.attackAction) {
            newAnimation.reset().setLoop(LoopOnce, 1).fadeIn(fadeDuration).play();
        } else {
            newAnimation.reset().fadeIn(fadeDuration).play();
        }
    }
    this.currentAction = newAnimation;
  }

  handleAnimationFinished(action: AnimationAction): void {
    if (action === this.attackAction) {
         if (this.currentState === 'Attacking' || this.currentState === 'Healing') {
            const isMoving = Math.abs(this.moveState.forward) > 0.1 || Math.abs(this.moveState.right) > 0.1;
            this.switchState(isMoving ? (this.moveState.sprint && !this.isExhausted ? 'Running' : 'Walking') : 'Idle');
         }
    } else if (action === this.jumpAction) {
        if (this.currentState === 'Jumping') {
            if (this.isOnGround) {
                 const isMoving = Math.abs(this.moveState.forward) > 0.1 || Math.abs(this.moveState.right) > 0.1;
                 this.switchState(isMoving ? (this.moveState.sprint && !this.isExhausted ? 'Running' : 'Walking') : 'Idle');
            } else {
                 this.switchState('Falling');
            }
        }
    }
  }

  performAttack(): void {
    const range = CHARACTER_ATTACK_RANGE;
    const damage =
      this.name === "Player"
        ? CHARACTER_PLAYER_ATTACK_DAMAGE
        : CHARACTER_NPC_ATTACK_DAMAGE;
    if (!this.rayCaster || !this.mesh || !this.scene || !this.game) return;

    const rayOrigin = this.mesh.position
      .clone()
      .add(new Vector3(0, CHARACTER_HEIGHT / 2, 0));
    const rayDirection = this.mesh.getWorldDirection(new Vector3());
    this.rayCaster.set(rayOrigin, rayDirection);
    this.rayCaster.far = range;

    const potentialTargets = this.game.entities.filter(
      (entity): entity is Character =>
        entity instanceof Character &&
        entity !== this &&
        !entity.isDead &&
        entity.mesh !== null &&
        entity.mesh.visible &&
        entity.userData?.isCollidable
    );
    const targetMeshes = potentialTargets.map((char) => char.mesh!);
    const intersects = this.rayCaster.intersectObjects(targetMeshes, true);

    if (intersects.length > 0) {
      for (const hit of intersects) {
        let hitObject = hit.object;
        let targetEntity: Character | null = null;
        while (hitObject) {
          if (hitObject.userData?.entityReference instanceof Character) {
            targetEntity = hitObject.userData.entityReference;
            break;
          }
          if (!hitObject.parent) break;
          hitObject = hitObject.parent;
        }
        if (targetEntity && targetEntity !== this && !targetEntity.isDead) {
          targetEntity.takeDamage(damage, this);
          this.game.spawnParticleEffect(hit.point, "red");
          break;
        }
      }
    }
  }

  selfHeal(): void {
    if (this.isDead || this.currentState === 'Dead' || this.currentState === 'Healing' || this.currentState === 'Attacking' || this.currentState === 'Jumping' || this.currentState === 'Falling' || this.currentState === 'Gathering') return;

    if (this.health >= this.maxHealth) {
        if (this.game) {
            this.game.logEvent(
                this,
                "heal_fail",
                `${this.name} is already at full health.`,
                undefined,
                {},
                this.mesh!.position
            );
        }
        return;
    }

    const healAmount = CHARACTER_SELF_HEAL_AMOUNT;
    const actualHeal = Math.min(healAmount, this.maxHealth - this.health);

    if (actualHeal > 0) {
      this.heal(actualHeal);
      if (this.game) {
          this.game.logEvent(
            this,
            "self_heal",
            `${this.name} healed for ${actualHeal} health.`,
            undefined,
            { amount: actualHeal },
            this.mesh!.position
          );
          this.game.spawnParticleEffect(
            this.mesh!.position.clone().add(new Vector3(0, CHARACTER_HEIGHT / 2, 0)),
            "green"
          );
      }
      this.switchState('Healing');
    }
  }

  handleStamina(deltaTime: number): void {
    if (this.currentState === 'Running') {
        const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
        if (isMoving && !this.isExhausted && this.stamina > 0) {
            this.stamina -= this.staminaDrainRate * deltaTime;
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.isExhausted = true;
                this.isSprinting = false;
                this.switchState('Walking');
                 if (this.game) this.game.logEvent(this, "exhausted", `${this.name} is exhausted!`, undefined, {}, this.mesh!.position);
            }
        } else if (!isMoving) {
             this.switchState('Idle');
        }
    } else {
      let regenRate = this.staminaRegenRate;
      if (this.isExhausted) {
        regenRate /= 2;
        if (this.stamina >= this.exhaustionThreshold) {
          this.isExhausted = false;
          if (this.game) this.game.logEvent(this, "recovered", `${this.name} feels recovered.`, undefined, {}, this.mesh!.position);
        }
      }
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * deltaTime);
    }
  }

  handleMovement(deltaTime: number): void {
    const forward = new Vector3(0, 0, 1).applyQuaternion(this.mesh!.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.mesh!.quaternion);
    const moveDirection = new Vector3(this.moveState.right, 0, this.moveState.forward).normalize();

    let currentSpeed = 0;
    if (this.currentState === 'Running') {
        currentSpeed = this.runSpeed;
    } else if (this.currentState === 'Walking') {
        currentSpeed = this.walkSpeed;
    }

    const moveVelocity = new Vector3();
    if (moveDirection.lengthSq() > 0 && currentSpeed > 0) {
        moveVelocity.addScaledVector(forward, moveDirection.z)
                    .addScaledVector(right, moveDirection.x)
                    .normalize()
                    .multiplyScalar(currentSpeed);
    }

    if (this.currentState === 'Idle' || this.currentState === 'Walking' || this.currentState === 'Running' || this.currentState === 'Falling' || this.currentState === 'Jumping') {
         this.velocity.x = moveVelocity.x;
         this.velocity.z = moveVelocity.z;
    } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
    }

    if (this.moveState.jump && this.canJump && this.stamina >= this.staminaJumpCost && (this.currentState === 'Idle' || this.currentState === 'Walking' || this.currentState === 'Running')) {
        this.velocity.y = this.jumpForce;
        this.stamina -= this.staminaJumpCost;
        this.canJump = false;
        this.isOnGround = false;
        this.moveState.jump = false;

        if (this.stamina <= 0 && !this.isExhausted) {
           this.isExhausted = true;
           if(this.currentState === 'Running') this.switchState('Walking');
            if (this.game) this.game.logEvent(this, "exhausted", `${this.name} became exhausted from jumping!`, undefined, {}, this.mesh!.position);
        }

        this.switchState('Jumping');

        if (this.game) this.game.logEvent(this, "jump", `${this.name} jumped.`, undefined, {}, this.mesh!.position);
    }
  }

  applyGravity(deltaTime: number): void {
    if (!this.isOnGround) {
      this.velocity.y += this.gravity * deltaTime;
      this.velocity.y = Math.max(this.velocity.y, -50);
    } else {
      this.velocity.y = Math.max(0, this.velocity.y);
    }
  }

  checkGround(collidables: Object3D[], camera?: Camera): void {
    const previouslyOnGround = this.isOnGround;

    this.groundCheckOrigin.copy(this.mesh!.position).add(new Vector3(0, 0.1, 0));
    const rayLength = 0.1 + this.groundCheckDistance;
    if (!this.rayCaster) return;

    if (camera) {
        this.rayCaster.camera = camera;
    } else {
        console.warn(`Character ${this.name}: Missing camera for ground check raycaster.`);
    }

    this.rayCaster.set(this.groundCheckOrigin, this.groundCheckDirection);
    this.rayCaster.far = rayLength;
    this.rayCaster.near = 0;

    const checkAgainst = collidables.filter(
        (obj) => obj && obj !== this.mesh && obj.parent && obj.visible && obj.userData?.isCollidable
    );

    const intersects = this.rayCaster.intersectObjects(checkAgainst, true);

    let foundGround = false;
    let groundY = -Infinity;
    let groundObject: Object3D | null = null;

    if (intersects.length > 0) {
        const firstHit = intersects[0];
        groundY = firstHit.point.y;
        groundObject = firstHit.object;
        foundGround = true;
    }

    const currentY = this.mesh!.position.y;
    const snapThreshold = 0.05;

    if (foundGround && currentY <= groundY + rayLength + snapThreshold) {
        this.isOnGround = true;
        this.canJump = true;

        if (!previouslyOnGround || Math.abs(currentY - groundY) > 0.01) {
             this.mesh!.position.y = groundY;
             this.velocity.y = 0;
        }
        this.velocity.y = Math.max(0, this.velocity.y);

        if (this.currentState === 'Falling' || this.currentState === 'Jumping') {
            const isMovingInput = Math.abs(this.moveState.forward) > 0.1 || Math.abs(this.moveState.right) > 0.1;
            this.switchState(isMovingInput ? (this.moveState.sprint && !this.isExhausted ? 'Running' : 'Walking') : 'Idle');
        }
    } else {
        this.isOnGround = false;
        this.canJump = false;

        if (previouslyOnGround || (this.currentState === 'Jumping' && this.velocity.y <= 0)) {
             if (this.currentState !== 'Falling') {
                this.switchState('Falling');
             }
        }
    }
  }

  updateAnimations(deltaTime: number): void {
    this.mixer.update(deltaTime);

    if (this.currentState === 'Gathering' && this.attackAction) {
        this.gatherAttackTimer += deltaTime;
        if (this.gatherAttackTimer >= this.gatherAttackInterval) {
            this.gatherAttackTimer = 0;
            if (!this.attackAction.isRunning()) {
                 this.attackAction.reset().setLoop(LoopOnce, 1).play();
                 if(this.currentAction === this.idleAction) this.idleAction?.fadeOut(0.1);
                 this.currentAction = this.attackAction;
            }
        }
        else if (!this.attackAction.isRunning() && this.currentAction === this.attackAction) {
             this.switchAnimation(this.idleAction);
        }
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.currentState === 'Dead') return;

    const { moveState, collidables, camera } = options;
    if (!moveState || !collidables) {
      console.warn(`Missing moveState or collidables for ${this.name} update`);
      return;
    }
    this.moveState = moveState;

    this.handleStamina(deltaTime);
    this.applyGravity(deltaTime);

    if (this.currentState === 'Idle' || this.currentState === 'Walking' || this.currentState === 'Running') {
        if (this.moveState.attack && !this.attackTriggered) {
            this.attackTriggered = true;
            this.switchState('Attacking');
        }
        else if (!this.attackTriggered) {
            const isMovingInput = Math.abs(this.moveState.forward) > 0.1 || Math.abs(this.moveState.right) > 0.1;
            const canRun = this.moveState.sprint && !this.isExhausted;
            let desiredState: CharacterState = 'Idle';
            if (isMovingInput) {
                desiredState = canRun ? 'Running' : 'Walking';
            }
            if (this.currentState !== desiredState) {
                this.switchState(desiredState);
            }
        }
    }
    if (!moveState.attack) {
        this.attackTriggered = false;
    }

    this.handleMovement(deltaTime);

    this.mesh!.position.x += this.velocity.x * deltaTime;
    this.mesh!.position.z += this.velocity.z * deltaTime;
    this.mesh!.position.y += this.velocity.y * deltaTime;

    this.checkGround(collidables, camera);

    this.updateAnimations(deltaTime);

    this.updateBoundingBox();
  }

  die(attacker: Entity | null = null): void {
    if (this.currentState === 'Dead') return;

    const previousState = this.currentState;

    super.die(attacker);
    this.switchState('Dead');

    if (this.game) {
      const message = `${this.name} has died!`;
      const details = attacker ? { killedBy: attacker.name } : {};
      this.game.logEvent(this, "death", message, undefined, details, this.mesh!.position);
      if (attacker instanceof Character) {
          const defeatMessage = `${attacker.name} defeated ${this.name}.`;
          this.game.logEvent(attacker, "defeat", defeatMessage, this.name, {}, attacker.mesh!.position);
      }
    }
  }

  respawn(position: Vector3): void {
      this.setPosition(position);
      this.health = this.maxHealth * 0.75;
      this.stamina = this.maxStamina;
      this.velocity.set(0, 0, 0);
      this.isDead = false;
      this.userData.isCollidable = true;
      this.userData.isInteractable = true;

      this.switchState('Idle', true);
      this.isExhausted = false;
      this.isOnGround = false;
      this.canJump = false;
      this.attackTriggered = false;
      this.gatherAttackTimer = 0;

      if (this.aiController) {
        this.aiController.resetAIState();
      }

      if (this.game)
        this.game.logEvent(
          this,
          "respawn",
          `${this.name} feels slightly disoriented but alive.`,
          undefined,
          {},
          position
        );

      this.updateBoundingBox();
      this.game?.entityDisplayManager?.addEntity(this);
  }

  interact(player: Character): InteractionResult | null {
    this.lookAt(player.mesh!.position);
    if (this.game)
      this.game.logEvent(
        player,
        "interact_start",
        `Started interacting with ${this.name}.`,
        this,
        {},
        player.mesh!.position
      );
    return { type: "chat" };
  }
}
