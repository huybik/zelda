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
  Sprite, // Added Sprite
  CanvasTexture,
  SpriteMaterial,
} from "three";
import {
  EventLog,
  Inventory,
  EntityUserData,
  UpdateOptions,
  smoothQuaternionSlerp,
  getNextEntityId,
  MoveState,
  getTerrainHeight,
  EventEntry,
  GameEvent,
  InteractionResult,
} from "./ultils"; // Added InteractionResult
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
  intentCanvas: HTMLCanvasElement | null = null;
  intentContext: CanvasRenderingContext2D | null = null;
  intentTexture: CanvasTexture | null = null;
  intentSprite: Sprite | null = null;
  nameCanvas: HTMLCanvasElement | null = null;
  nameContext: CanvasRenderingContext2D | null = null;
  nameTexture: CanvasTexture | null = null;
  nameSprite: Sprite | null = null;
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
    this.health = 100;
    this.maxHealth = 100;
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
    if (this.mesh) {
      this.mesh.userData = this.userData;
      this.mesh.name = this.name;
      this.scene.add(this.mesh);
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {}

  initNameDisplay(): void {
    if (this.userData.isPlayer) return;

    if (!this.nameCanvas) {
      this.nameCanvas = document.createElement("canvas");
      this.nameCanvas.width = 200;
      this.nameCanvas.height = 30; // Smaller height for name
      this.nameContext = this.nameCanvas.getContext("2d")!;
      this.nameTexture = new CanvasTexture(this.nameCanvas);
    }

    if (!this.nameSprite) {
      const material = new SpriteMaterial({ map: this.nameTexture });
      this.nameSprite = new Sprite(material);
      const aspectRatio = this.nameCanvas.width / this.nameCanvas.height;
      this.nameSprite.scale.set(aspectRatio * 0.3, 0.3, 1); // Smaller scale than intent
      this.nameSprite.position.set(0, CHARACTER_HEIGHT + 0.15, 0); // Below intent display
      this.mesh!.add(this.nameSprite);
    }

    this.updateNameDisplay(this.name);
  }
  updateNameDisplay(name: string): void {
    if (!this.nameContext || !this.nameCanvas || !this.nameTexture) return;

    const ctx = this.nameContext;
    const canvas = this.nameCanvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px Arial";
    ctx.fillStyle = "blue";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    this.nameTexture.needsUpdate = true;
  }

  initIntentDisplay(): void {
    this.rayCaster = new Raycaster();
    if (this.game?.camera) {
      this.rayCaster.camera = this.game.camera;
    }

    if (!this.intentCanvas) {
      this.intentCanvas = document.createElement("canvas");
      this.intentCanvas.width = 200;
      this.intentCanvas.height = 70;
      this.intentContext = this.intentCanvas.getContext("2d")!;
      this.intentTexture = new CanvasTexture(this.intentCanvas);
    }

    if (!this.intentSprite) {
      const material = new SpriteMaterial({ map: this.intentTexture });
      this.intentSprite = new Sprite(material);
      const aspectRatio = this.intentCanvas.width / this.intentCanvas.height;
      this.intentSprite.scale.set(aspectRatio * 0.6, 0.6, 1);
      this.intentSprite.position.set(0, CHARACTER_HEIGHT + 0.6, 0);
      this.mesh!.add(this.intentSprite);
    }

    this.updateIntentDisplay("");
  }
  removeDisplays(): void {
    if (this.intentSprite && this.mesh) {
      this.mesh.remove(this.intentSprite);
      this.intentSprite = null;
    }
    if (this.nameSprite && this.mesh) {
      this.mesh.remove(this.nameSprite);
      this.nameSprite = null;
    }
  }

  updateIntentDisplay(text: string): void {
    if (!this.intentContext || !this.intentCanvas || !this.intentTexture)
      return;

    if (!text || text.trim() === "") {
      if (this.intentSprite) {
        this.intentSprite.visible = false;
      }
      return;
    } else {
      if (this.intentSprite) {
        this.intentSprite.visible = true;
      }
    }

    const ctx = this.intentContext;
    const canvas = this.intentCanvas;
    const maxWidth = canvas.width - 10; // Padding
    const lineHeight = 20; // Slightly more than font size
    const x = canvas.width / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // Slightly darker background

    const borderRadius = 10; // Adjust this value to change the corner radius
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    ctx.fill();

    ctx.font = "13px Arial"; // Reduced font size
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Basic Text Wrapping Logic
    const words = text.split(" ");
    let lines = [];
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && i > 0) {
        lines.push(currentLine.trim());
        currentLine = words[i] + " ";
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trim());

    // Calculate starting Y position for vertical centering
    const totalTextHeight = lines.length * lineHeight;
    let startY = (canvas.height - totalTextHeight) / 2 + lineHeight / 2;

    // Draw lines
    for (let i = 0; i < lines.length; i++) {
      // Prevent drawing too many lines if text is excessively long
      if (startY + i * lineHeight > canvas.height - lineHeight / 2) {
        // Optional: Indicate truncation if needed
        if (i > 0) {
          // Check if we drew at least one line
          const lastLineIndex = i - 1;
          const lastLineText = lines[lastLineIndex];
          // Remove last drawn line and replace with ellipsis
          ctx.clearRect(
            0,
            startY + lastLineIndex * lineHeight - lineHeight / 2,
            canvas.width,
            lineHeight
          );
          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.fillRect(
            0,
            startY + lastLineIndex * lineHeight - lineHeight / 2,
            canvas.width,
            lineHeight
          );
          ctx.fillStyle = "white";
          ctx.fillText(
            lastLineText.substring(0, lastLineText.length - 1) + "...",
            x,
            startY + lastLineIndex * lineHeight
          );
        }
        break;
      }
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }

    this.intentTexture.needsUpdate = true;
  }

  showTemporaryMessage(message: string, duration: number = 7000): void {
    if (!this.intentSprite) return;
    const originalText = this.aiController
      ? `${this.name}: ${this.aiController.currentIntent}`
      : "";
    this.updateIntentDisplay(message);
    setTimeout(() => {
      // Check if the AI controller still exists and has an intent before resetting
      const currentIntentText = this.aiController
        ? `${this.name}: ${this.aiController.currentIntent}`
        : "";
      this.updateIntentDisplay(currentIntentText || originalText); // Fallback to original if no current intent
    }, duration);
  }

  updateBoundingBox(): void {
    if (!this.mesh) return;
    const height = this.userData.height ?? 1.8;
    const radius = this.userData.radius ?? 0.4;
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
  }

  destroy(): void {
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

const CHARACTER_HEIGHT = 1.8;
const CHARACTER_RADIUS = 0.4;

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
  attackAction?: AnimationAction; // Can be used for heal animation too
  isGathering: boolean = false;
  gatherAttackTimer: number = 0;
  gatherAttackInterval: number = 1.0;
  searchRadius: number = 30;
  roamRadius: number = 10;
  attackTriggered: boolean = false;
  inventory: Inventory | null;
  game: Game | null = null;
  persona: string = "";
  aiController: AIController | null = null;
  currentAction?: AnimationAction;

  actionType: string = "none"; // 'attack', 'heal', 'gather' etc.
  isPerformingAction: boolean = false;

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
    this.userData.isCollidable = false;
    this.userData.isInteractable = true;
    this.userData.interactionType = "talk";
    this.userData.isNPC = true;
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
    this.moveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false,
      attack: false,
    };
    this.gravity = -25;
    this.isOnGround = false;
    this.groundCheckDistance = 0.15;
    this.lastVelocityY = 0;
    this.inventory = inventory;
    this.eventLog = new EventLog(50);
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
    if (this.idleAction) {
      this.switchAction(this.idleAction); // Set initial action with fading
    }
    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;
    this.updateBoundingBox();

    // Updated mixer listener
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.attackAction) {
        if (this.actionType === "attack") {
          this.performAttack();
        } else if (this.actionType === "heal") {
          // Heal logic already applied in selfHeal
        }
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
      } else if (e.action === this.jumpAction) {
        // Handled in updateAnimations
      }
    });

    if (this.userData.isNPC) {
      this.aiController = new AIController(this);
    }
  }
  switchAction(newAction: AnimationAction | undefined): void {
    if (newAction === this.currentAction) {
      if (newAction && !newAction.isRunning()) newAction.play();
      return;
    }
    if (this.currentAction) {
      this.currentAction.fadeOut(0.2); // Fade out current animation over 0.2 seconds
    }
    if (newAction) {
      newAction.reset().fadeIn(0.1).play(); // Fade in new animation
    }
    this.currentAction = newAction;
  }

  performAttack(): void {
    const range = 2.0;
    const damage = this.name === "Player" ? 10 : 5;
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
        entity.mesh !== null
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
    if (
      this.isDead ||
      this.isPerformingAction ||
      this.health >= this.maxHealth
    ) {
      if (this.health >= this.maxHealth) {
        this.game?.logEvent(
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

    const healAmount = 25; // Amount to heal
    const actualHeal = Math.min(healAmount, this.maxHealth - this.health);

    if (actualHeal > 0) {
      this.heal(actualHeal); // Apply the heal immediately

      // Log the event
      if (this.game) {
        this.game.logEvent(
          this,
          "self_heal",
          `${this.name} healed for ${actualHeal} health.`,
          undefined,
          { amount: actualHeal },
          this.mesh!.position
        );
        // Spawn heal particles at character's feet/center
        this.game.spawnParticleEffect(
          this.mesh!.position.clone().add(
            new Vector3(0, CHARACTER_HEIGHT / 2, 0)
          ),
          "green"
        );
      }

      // Trigger the heal animation (using attackAction slot for now)
      this.triggerAction("heal");
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
    if (
      this.moveState.jump &&
      this.canJump &&
      this.stamina >= this.staminaJumpCost
    ) {
      this.velocity.y = this.jumpForce;
      this.stamina -= this.staminaJumpCost;
      this.canJump = false;
      this.isOnGround = false;
      if (this.stamina <= 0 && !this.isExhausted) {
        this.isExhausted = true;
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
      this.moveState.jump = false;
      this.switchAction(this.jumpAction); // Smooth transition to jump
      if (this.game)
        this.game.logEvent(
          this,
          "jump",
          `${this.name} jumped.`,
          undefined,
          {},
          this.mesh!.position
        );
    }
  }

  applyGravity(deltaTime: number): void {
    if (!this.isOnGround) {
      this.velocity.y += this.gravity * deltaTime * 0.2;
    } else {
      this.velocity.y = Math.max(this.gravity * deltaTime, -0.1);
    }
  }

  checkGround(collidables: Object3D[]): void {
    this.groundCheckOrigin
      .copy(this.mesh!.position)
      .add(new Vector3(0, 0.1, 0));
    const rayLength = 0.1 + this.groundCheckDistance;
    if (!this.rayCaster) return;
    this.rayCaster.set(this.groundCheckOrigin, this.groundCheckDirection);
    this.rayCaster.far = rayLength;
    this.rayCaster.near = 0;

    const checkAgainst = collidables.filter(
      (obj) => obj !== this.mesh && obj?.userData?.isCollidable
    );
    const intersects = this.rayCaster.intersectObjects(checkAgainst, true);
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
    const baseY = this.mesh!.position.y;
    const snapThreshold = 0.05;
    if (
      foundGround &&
      baseY <= groundY + this.groundCheckDistance + snapThreshold
    ) {
      if (!this.isOnGround && this.velocity.y <= 0) {
        this.mesh!.position.y = groundY;
        this.velocity.y = 0;
        this.isOnGround = true;
        this.canJump = true;
        // if (this.jumpAction?.isRunning()) this.jumpAction.stop();
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

    if (this.isGathering && this.attackAction) {
      this.gatherAttackTimer += deltaTime;
      if (this.gatherAttackTimer >= this.gatherAttackInterval) {
        this.switchAction(this.attackAction);
        this.gatherAttackTimer = 0;
      } else if (!this.attackAction.isRunning()) {
        this.switchAction(this.idleAction);
      }
    } else if (this.isPerformingAction && this.attackAction) {
      // Let action play; transition handled in 'finished' listener
    } else if (!this.isOnGround) {
      if (this.jumpAction && this.jumpAction.isRunning()) {
        // Let jumpAction continue
      } else {
        this.switchAction(this.idleAction); // Use idle as fallback in air
      }
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
    // Use attackAction for attack, heal, gather visual feedback
    if (this.attackAction && !this.isPerformingAction && !this.isGathering) {
      this.actionType = actionType;
      this.isPerformingAction = true; // Mark that an action animation is playing
      this.attackAction.reset().play();
      // Stop movement animations immediately when action starts
      if (this.idleAction?.isRunning()) this.idleAction.stop();
      if (this.walkAction?.isRunning()) this.walkAction.stop();
      if (this.runAction?.isRunning()) this.runAction.stop();
      if (this.jumpAction?.isRunning()) this.jumpAction.stop();
    } else if (actionType === "gather" && this.attackAction) {
      // Special case for gather, handled in updateAnimations
      this.actionType = actionType; // Set type, but let update handle looping anim
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) return;
    const { moveState, collidables } = options;
    if (!moveState || !collidables) {
      console.warn(`Missing moveState or collidables for ${this.name} update`);
      return;
    }
    this.moveState = moveState;
    this.handleStamina(deltaTime);
    if (!this.isPerformingAction && !this.isGathering) {
      this.handleMovement(deltaTime);
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    this.applyGravity(deltaTime);
    this.mesh!.position.x += this.velocity.x * deltaTime;
    this.mesh!.position.z += this.velocity.z * deltaTime;
    this.checkGround(collidables);
    this.mesh!.position.y += this.velocity.y * deltaTime;

    if (moveState.attack && !this.attackTriggered) {
      this.attackTriggered = true;
      this.triggerAction("attack");
    } else if (!moveState.attack) {
      this.attackTriggered = false;
    }

    this.lastVelocityY = this.velocity.y;
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
    this.isOnGround = false;
    this.canJump = false;
    this.lastVelocityY = 0;
    this.isGathering = false;
    this.gatherAttackTimer = 0;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;
    this.userData.isCollidable = false;
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
    if (this.jumpAction) this.jumpAction.stop();

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
    return { type: "chat" }; // Signal to InteractionSystem to open chat UI
  }
}
