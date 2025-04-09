// File: /src/entities/character.ts
import {
  Scene,
  Vector3,
  Box3,
  Group,
  AnimationMixer,
  AnimationClip,
  AnimationAction,
  LoopOnce,
  Mesh,
} from "three";
import {
  EventLog,
  Inventory,
  UpdateOptions,
  MoveState,
  getTerrainHeight,
  InteractionResult,
} from "../core/utils";
import { AIController } from "./ai";
import { Entity } from "../entities/entitiy";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS } from "../core/constants";

export class Character extends Entity {
  maxStamina: number;
  stamina: number;
  walkSpeed: number;
  runSpeed: number;
  staminaDrainRate: number;
  staminaRegenRate: number;
  isSprinting: boolean;
  isExhausted: boolean;
  exhaustionThreshold: number;
  moveState: MoveState;
  eventLog: EventLog;
  mixer: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  attackAction?: AnimationAction;
  isGathering: boolean = false;
  gatherAttackTimer: number = 0;
  gatherAttackInterval: number = 1.0;
  searchRadius: number = 30;
  roamRadius: number = 10;
  attackTriggered: boolean = false;
  inventory: Inventory | null;
  persona: string = "";
  currentAction?: AnimationAction;
  actionType: string = "none";
  isPerformingAction: boolean = false;

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
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.maxStamina = 100;
    this.stamina = this.maxStamina;
    this.walkSpeed = 4.0;
    this.runSpeed = 8.0;
    this.staminaDrainRate = 15;
    this.staminaRegenRate = 10;
    this.isSprinting = false;
    this.isExhausted = false;
    this.exhaustionThreshold = 20;
    this.moveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false,
      attack: false,
    };
    this.inventory = inventory;
    this.eventLog = new EventLog(50);
    const box = new Box3().setFromObject(model);
    const currentHeight = box.max.y - box.min.y;
    const scale = CHARACTER_HEIGHT / currentHeight;
    model.scale.set(scale, scale, scale);
    model.position.y = -box.min.y * scale;
    this.mesh!.add(model);

    // Enable shadow casting for all meshes within the character model
    model.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = false; // Characters usually don't receive shadows on themselves
      }
    });

    this.mixer = new AnimationMixer(model);
    const idleAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("idled")
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
    const attackAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("attack")
    );
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
    }
    if (this.idleAction) this.switchAction(this.idleAction);
    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;
    this.updateBoundingBox();

    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.attackAction) {
        if (this.moveState.attack) {
          this.performAttack();
          this.attackAction?.reset().play();
        } else if (!this.isGathering) {
          this.isPerformingAction = false;
          this.actionType = "none";
          const isMoving =
            Math.abs(this.moveState.forward) > 0.1 ||
            Math.abs(this.moveState.right) > 0.1;
          let targetAction: AnimationAction | undefined;
          if (isMoving) {
            targetAction =
              this.isSprinting && this.runAction
                ? this.runAction
                : this.walkAction;
          } else {
            targetAction = this.idleAction;
          }
          this.switchAction(targetAction);
        }
      }
    });

    if (this.userData.isNPC) this.aiController = new AIController(this);
  }

  switchAction(newAction: AnimationAction | undefined): void {
    if (newAction === this.currentAction) {
      if (newAction && !newAction.isRunning()) newAction.play();
      return;
    }
    if (this.currentAction) this.currentAction.fadeOut(0.2);
    if (newAction) newAction.reset().fadeIn(0.1).play();
    this.currentAction = newAction;
  }

  performAttack(): void {
    const range = 2.0;
    const damage = this.name === "Player" ? 10 : 5;
    if (!this.mesh || !this.scene || !this.game) return;

    const rayOrigin = this.mesh.position
      .clone()
      .add(new Vector3(0, CHARACTER_HEIGHT / 2, 0));
    const rayDirection = this.mesh.getWorldDirection(new Vector3());
    this.rayCaster!.set(rayOrigin, rayDirection);

    const potentialTargets = this.game.entities.filter(
      (entity): entity is Character =>
        entity instanceof Character &&
        entity !== this &&
        !entity.isDead &&
        entity.mesh !== null
    );

    let closestTarget: Character | null = null;
    let closestDistance = Infinity;
    let closestPoint: Vector3 | null = null;

    for (const target of potentialTargets) {
      const box = target.boundingBox;
      const intersectionPoint = this.rayCaster?.ray.intersectBox(
        box,
        new Vector3()
      );
      if (intersectionPoint) {
        const distance = rayOrigin.distanceTo(intersectionPoint);
        if (distance < closestDistance && distance <= range) {
          closestDistance = distance;
          closestTarget = target;
          closestPoint = intersectionPoint;
        }
      }
    }

    if (closestTarget && closestPoint) {
      closestTarget.takeDamage(damage, this);
      this.game.spawnParticleEffect(closestPoint, "red");
    }
  }

  handleStamina(deltaTime: number): void {
    const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
    this.isSprinting =
      this.moveState.sprint &&
      isMoving &&
      !this.isExhausted &&
      this.stamina > 0;
    if (this.isSprinting) {
      this.stamina -= this.staminaDrainRate * deltaTime;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.isExhausted = true;
        this.isSprinting = false;
        if (this.game)
          this.game.logEvent(
            this,
            "exhausted",
            `${this.name} is exhausted!`,
            undefined,
            {},
            this.mesh!.position
          );
      }
    } else {
      let regenRate = this.staminaRegenRate;
      if (this.isExhausted) {
        regenRate /= 2;
        if (this.stamina >= this.exhaustionThreshold) {
          this.isExhausted = false;
          if (this.game)
            this.game.logEvent(
              this,
              "recovered",
              `${this.name} feels recovered.`,
              undefined,
              {},
              this.mesh!.position
            );
        }
      }
      this.stamina = Math.min(
        this.maxStamina,
        this.stamina + regenRate * deltaTime
      );
    }
  }

  handleMovement(deltaTime: number): void {
    const forward = new Vector3(0, 0, 1).applyQuaternion(this.mesh!.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.mesh!.quaternion);
    const moveDirection = new Vector3(
      this.moveState.right,
      0,
      this.moveState.forward
    ).normalize();
    const moveVelocity = new Vector3()
      .addScaledVector(forward, moveDirection.z)
      .addScaledVector(right, moveDirection.x);
    const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
    if (moveDirection.lengthSq() > 0) {
      moveVelocity.normalize().multiplyScalar(currentSpeed);
    }
    this.velocity.x = moveVelocity.x;
    this.velocity.z = moveVelocity.z;
  }

  updateAnimations(deltaTime: number): void {
    this.mixer.update(deltaTime);
    if (this.isGathering && this.attackAction) {
      this.gatherAttackTimer += deltaTime;
      if (this.gatherAttackTimer >= this.gatherAttackInterval) {
        this.switchAction(this.attackAction);
        this.gatherAttackTimer = 0;
      } else if (
        !this.attackAction.isRunning() &&
        this.currentAction !== this.idleAction
      ) {
        this.switchAction(this.idleAction);
      }
    } else if (this.isPerformingAction && this.attackAction) {
      // Animation is handled by the 'finished' listener
    } else {
      const isMoving =
        Math.abs(this.moveState.forward) > 0.1 ||
        Math.abs(this.moveState.right) > 0.1;
      let targetAction: AnimationAction | undefined;
      if (isMoving) {
        targetAction =
          this.isSprinting && this.runAction ? this.runAction : this.walkAction;
      } else {
        targetAction = this.idleAction;
      }
      this.switchAction(targetAction);
    }
  }

  triggerAction(actionType: string): void {
    if (
      actionType === "attack" &&
      this.attackAction &&
      !this.isPerformingAction &&
      !this.isGathering
    ) {
      this.actionType = actionType;
      this.isPerformingAction = true;
      this.attackAction.reset().play();
      if (this.idleAction?.isRunning()) this.idleAction.stop();
      if (this.walkAction?.isRunning()) this.walkAction.stop();
      if (this.runAction?.isRunning()) this.runAction.stop();
      this.performAttack();
    } else if (actionType === "gather" && this.attackAction) {
      this.actionType = actionType;
      this.attackAction.reset().play();
      this.switchAction(this.attackAction);
      this.gatherAttackTimer = 0;
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) return;
    const { moveState, collidables } = options;
    if (!moveState || !collidables) return;
    this.moveState = moveState;
    this.handleStamina(deltaTime);
    if (!this.isPerformingAction && !this.isGathering) {
      this.handleMovement(deltaTime);
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    this.mesh!.position.x += this.velocity.x * deltaTime;
    this.mesh!.position.z += this.velocity.z * deltaTime;
    if (this.scene) {
      const groundY = getTerrainHeight(
        this.scene,
        this.mesh!.position.x,
        this.mesh!.position.z
      );
      this.mesh!.position.y = groundY;
    }
    this.velocity.y = 0;
    if (moveState.attack && !this.attackTriggered) {
      this.attackTriggered = true;
      this.triggerAction("attack");
    } else if (!moveState.attack) {
      this.attackTriggered = false;
    }
    this.updateAnimations(deltaTime);
    this.updateBoundingBox();
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;
    super.die(attacker);
    if (this.aiController) this.aiController.aiState = "dead";
    this.isGathering = false;
    this.isPerformingAction = false;
    this.actionType = "none";
    if (this.game) {
      const message = `${this.name} has died!`;
      const details = attacker ? { killedBy: attacker.name } : {};
      this.game.logEvent(
        this,
        "death",
        message,
        undefined,
        details,
        this.mesh!.position
      );
      if (attacker instanceof Character) {
        const defeatMessage = `${attacker.name} defeated ${this.name}.`;
        this.game.logEvent(
          attacker,
          "defeat",
          defeatMessage,
          this.name,
          {},
          attacker.mesh!.position
        );
      }
    }
  }

  respawn(position: Vector3): void {
    this.setPosition(position);
    this.health = this.maxHealth * 0.75;
    this.stamina = this.maxStamina;
    this.velocity.set(0, 0, 0);
    this.isDead = false;
    this.isExhausted = false;
    this.isGathering = false;
    this.gatherAttackTimer = 0;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;
    if (this.aiController) {
      this.aiController.aiState = "idle";
      this.aiController.previousAiState = "idle";
      this.aiController.destination = null;
      this.aiController.targetResource = null;
      this.aiController.target = null;
      this.aiController.targetAction = null;
      this.aiController.message = null;
    }
    if (this.idleAction) this.idleAction.reset().play();
    if (this.walkAction) this.walkAction.stop();
    if (this.runAction) this.runAction.stop();
    if (this.attackAction) this.attackAction.stop();
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
