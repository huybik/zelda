import {
  Scene,
  Vector3,
  Box3,
  Group,
  Mesh,
  Material,
  Object3D,
  AnimationMixer,
  AnimationClip,
  AnimationAction,
  LoopOnce,
  Sprite,
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
  InteractionResult,
} from "../core/helper";
import { Raycaster } from "three";
import { Game } from "../main";
import { AIController } from "./ai";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS } from "../core/constants";

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

  update(deltaTime: number, options: UpdateOptions = {}): void {}

  initNameDisplay(): void {
    if (this.userData.isPlayer) return;
    if (!this.nameCanvas) {
      this.nameCanvas = document.createElement("canvas");
      this.nameCanvas.width = 200;
      this.nameCanvas.height = 30;
      this.nameContext = this.nameCanvas.getContext("2d")!;
      this.nameTexture = new CanvasTexture(this.nameCanvas);
    }
    if (!this.nameSprite) {
      const material = new SpriteMaterial({ map: this.nameTexture });
      this.nameSprite = new Sprite(material);
      const aspectRatio = this.nameCanvas.width / this.nameCanvas.height;
      this.nameSprite.scale.set(aspectRatio * 0.3, 0.3, 1);
      this.nameSprite.position.set(0, CHARACTER_HEIGHT + 0.15, 0);
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
      if (this.intentSprite) this.intentSprite.visible = false;
      return;
    } else {
      if (this.intentSprite) this.intentSprite.visible = true;
    }
    const ctx = this.intentContext;
    const canvas = this.intentCanvas;
    const maxWidth = canvas.width - 10;
    const lineHeight = 20;
    const x = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 10);
    ctx.fill();
    ctx.font = "13px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = text.split(" ");
    let lines = [];
    let currentLine = "";
    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        lines.push(currentLine.trim());
        currentLine = words[i] + " ";
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trim());
    const totalTextHeight = lines.length * lineHeight;
    let startY = (canvas.height - totalTextHeight) / 2 + lineHeight / 2;
    for (let i = 0; i < lines.length; i++) {
      if (startY + i * lineHeight > canvas.height - lineHeight / 2) {
        if (i > 0) {
          const lastLineIndex = i - 1;
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
            lines[lastLineIndex].substring(0, lines[lastLineIndex].length - 1) +
              "...",
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
      const currentIntentText = this.aiController
        ? `${this.name}: ${this.aiController.currentIntent}`
        : "";
      this.updateIntentDisplay(currentIntentText || originalText);
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
  game: Game | null = null;
  persona: string = "";
  aiController: AIController | null = null;
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
      } else if (!this.attackAction.isRunning()) {
        this.switchAction(this.idleAction);
      }
    } else if (this.isPerformingAction && this.attackAction) {
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
    if (this.attackAction && !this.isPerformingAction && !this.isGathering) {
      this.actionType = actionType;
      this.isPerformingAction = true;
      this.attackAction.reset().play();
      if (this.idleAction?.isRunning()) this.idleAction.stop();
      if (this.walkAction?.isRunning()) this.walkAction.stop();
      if (this.runAction?.isRunning()) this.runAction.stop();
      if (actionType === "attack") {
        this.performAttack();
      }
    } else if (actionType === "gather" && this.attackAction) {
      this.actionType = actionType;
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
