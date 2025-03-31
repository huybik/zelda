// src/entities.ts
import {
  Scene, Vector3, Box3, Quaternion, Group, Mesh, Material, Object3D, Matrix4,
  AnimationMixer, AnimationClip, AnimationAction, LoopOnce
} from 'three';
import { EventLog, Inventory, EntityUserData, UpdateOptions, smoothQuaternionSlerp, getNextEntityId, MoveState, getTerrainHeight, EventEntry, GameEvent } from './ultils'; // Added GameEvent
import { Raycaster } from 'three';
import type { Game } from './main'; // Import Game type for game property

// Define Observation interface
export interface Observation {
  timestamp: number;
  nearbyCharacters: Array<{
    id: string;
    position: Vector3;
    health: number;
    isDead: boolean;
    currentAction: string;
  }>;
  nearbyObjects: Array<{
    id: string;
    type: string;
    position: Vector3;
    isInteractable: boolean;
    resource?: string;
  }>;
}


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

  takeDamage(amount: number, attacker: Entity | null = null): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.die(attacker); // Pass attacker to die
  }

  heal(amount: number): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  die(attacker: Entity | null = null): void { // Accept attacker
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

const CHARACTER_HEIGHT = 1.8;
const CHARACTER_RADIUS = 0.4;

export class Character extends Entity {
  // Core properties from Character
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
  eventLog: EventLog; // Changed to non-null
  mixer: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  jumpAction?: AnimationAction;
  attackAction?: AnimationAction;
  isGathering: boolean = false;
  isAttacking: boolean = false;
  gatherAttackTimer: number = 0;
  gatherAttackInterval: number = 1.0;
  attackTriggered: boolean = false;
  inventory: Inventory | null;

  // AI properties from NPC
  aiState: string = 'idle';
  previousAiState: string = 'idle'; // Added for state change logging
  homePosition: Vector3;
  roamRadius: number = 10;
  destination: Vector3 | null = null;
  targetResource: Object3D | null = null;
  gatherTimer: number = 0;
  gatherDuration: number = 0;
  actionTimer: number = 5;
  interactionDistance: number = 3;
  searchRadius: number = 120;
  target: Entity | null = null;

  // New properties
  game: Game | null = null; // Reference to the Game instance
  observation: Observation | null = null; // Observation object

  private groundCheckOrigin = new Vector3();
  private groundCheckDirection = new Vector3(0, -1, 0);

  constructor(scene: Scene, position: Vector3, name: string, model: Group, animations: AnimationClip[], inventory: Inventory | null) {
    super(scene, position, name);
    this.userData.isCollidable = true;
    this.userData.isInteractable = true; // All characters are interactable
    this.userData.interactionType = 'talk';
    this.userData.isNPC = true; // Assume NPC unless player
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
    this.inventory = inventory;
    this.homePosition = position.clone();

    // Initialize independent event log
    this.eventLog = new EventLog(50);

    // Model setup
    const box = new Box3().setFromObject(model);
    const currentHeight = box.max.y - box.min.y;
    const scale = CHARACTER_HEIGHT / currentHeight;
    model.scale.set(scale, scale, scale);
    model.position.y = -box.min.y * scale;
    this.mesh!.add(model);

    // Animation setup
    this.mixer = new AnimationMixer(model);
    const idleAnim = animations.find(anim => anim.name.toLowerCase().includes('idle'));
    if (idleAnim) this.idleAction = this.mixer.clipAction(idleAnim);
    const walkAnim = animations.find(anim => anim.name.toLowerCase().includes('walk'));
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    const runAnim = animations.find(anim => anim.name.toLowerCase().includes('run'));
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    const jumpAnim = animations.find(anim => anim.name.toLowerCase().includes('jump'));
    if (jumpAnim) {
      this.jumpAction = this.mixer.clipAction(jumpAnim);
      this.jumpAction.setLoop(LoopOnce, 1);
      this.jumpAction.clampWhenFinished = true;
    }
    const attackAnim = animations.find(anim => anim.name.toLowerCase().includes('attack'));
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
    }
    if (this.idleAction) this.idleAction.play();

    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;
    this.updateBoundingBox();

    // Animation event listener
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.attackAction) {
        this.performAttack();
        this.isAttacking = false;
        const isMoving = Math.abs(this.moveState.forward) > 0.1 || Math.abs(this.moveState.right) > 0.1;
        if (isMoving) {
          if (this.isSprinting && this.runAction) this.runAction.play();
          else if (this.walkAction) this.walkAction.play();
        } else {
          if (this.idleAction) this.idleAction.play();
        }
      }
    });
  }

  // Methods from Character
  performAttack(): void {
    const range = 2.0;
    const damage = this.name === 'Character' ? 10 : 5; // Character deals more damage
    const raycaster = new Raycaster();
    raycaster.set(this.mesh!.position, this.mesh!.getWorldDirection(new Vector3()));
    raycaster.far = range;
    const entities = this.scene!.children.filter(child => child.userData.isEntity && child !== this.mesh);
    const intersects = raycaster.intersectObjects(entities, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      let targetEntity: Entity | null = null;
      let hitObject = hit.object;
      while(hitObject && !targetEntity) {
          if (hitObject.userData?.entityReference instanceof Entity) {
              targetEntity = hitObject.userData.entityReference;
          }
          hitObject = hitObject.parent!;
      }

      if (targetEntity && targetEntity.takeDamage) {
        targetEntity.takeDamage(damage, this);
        if (this.game) {
          const message = `${this.name} hit ${targetEntity.name} for ${damage} damage.`;
          this.game.logEvent(this, "attack", message, targetEntity.name, { damage }, this.mesh!.position);
          // Death is handled in takeDamage -> die -> logEvent
        }
      }
    }
  }

  // Removed setEventLog as each character has its own log now

  handleStamina(deltaTime: number): void {
    const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
    this.isSprinting = this.moveState.sprint && isMoving && !this.isExhausted && this.stamina > 0;
    if (this.isSprinting) {
      this.stamina -= this.staminaDrainRate * deltaTime;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.isExhausted = true;
        this.isSprinting = false;
        if (this.game) this.game.logEvent(this, "exhausted", `${this.name} is exhausted!`, undefined, {}, this.mesh!.position);
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
    const moveVelocity = new Vector3()
      .addScaledVector(forward, moveDirection.z)
      .addScaledVector(right, moveDirection.x);
    const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
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
        if (this.game) this.game.logEvent(this, "exhausted", `${this.name} is exhausted!`, undefined, {}, this.mesh!.position);
      }
      this.moveState.jump = false;
      if (this.jumpAction) this.jumpAction.reset().play();
      if (this.game) this.game.logEvent(this, "jump", `${this.name} jumped.`, undefined, {}, this.mesh!.position);
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
    const baseY = this.mesh!.position.y;
    const snapThreshold = 0.05;
    if (foundGround && baseY <= groundY + this.groundCheckDistance + snapThreshold) {
      if (!this.isOnGround && this.velocity.y <= 0) {
        this.mesh!.position.y = groundY;
        this.velocity.y = 0;
        this.isOnGround = true;
        this.canJump = true;
        if (this.jumpAction?.isRunning()) this.jumpAction.stop();
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
      if (this.idleAction) this.idleAction.play();
    } else if (!this.isAttacking) {
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
  }

  triggerAttack(): void {
    if (this.attackAction) {
      this.isAttacking = true;
      if (this.walkAction) this.walkAction.stop();
      if (this.runAction) this.runAction.stop();
      if (this.idleAction) this.idleAction.stop();
      this.attackAction.reset().play();
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) return;
    const { moveState, collidables } = options;
    if (!moveState || !collidables) {
      console.warn('Missing moveState or collidables for Character update');
      return;
    }
    this.moveState = moveState;
    this.handleStamina(deltaTime);
    if (!this.isAttacking && !this.isGathering) {
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
      this.triggerAttack();
    } else if (!moveState.attack) {
      this.attackTriggered = false;
    }
    if (this.isGathering) {
      this.gatherAttackTimer += deltaTime;
      if (this.gatherAttackTimer >= this.gatherAttackInterval) {
        this.gatherAttackTimer = 0;
        if (this.attackAction) this.attackAction.reset().play();
      }
    }
    this.lastVelocityY = this.velocity.y;
    this.updateAnimations(deltaTime);
    this.updateBoundingBox();

    // Log AI state changes
    if (this.aiState !== this.previousAiState) {
      if (this.game) {
        let message = '';
        switch (this.aiState) {
          case 'idle': message = `${this.name} is now idle.`; break;
          case 'roaming': message = `${this.name} is roaming.`; break;
          case 'movingToResource': message = `${this.name} is moving to a resource.`; break;
          case 'gathering': message = `${this.name} started gathering.`; break;
          // Add other states as needed
        }
        if (message) {
          this.game.logEvent(this, this.aiState, message, undefined, {}, this.mesh!.position);
        }
      }
      this.previousAiState = this.aiState;
    }
  }

  die(attacker: Entity | null = null): void { // Accept attacker
    if (this.isDead) return;
    super.die(attacker); // Pass attacker to super
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
    this.isExhausted = false;
    this.isOnGround = false;
    this.canJump = false;
    this.lastVelocityY = 0;
    this.isGathering = false;
    this.gatherAttackTimer = 0;
    this.aiState = 'idle';
    this.previousAiState = 'idle'; // Reset previous state
    if (this.game) this.game.logEvent(this, "respawn", `${this.name} feels slightly disoriented but alive.`, undefined, {}, position);
    this.updateBoundingBox();
  }

  // AI Logic
  computeAIMoveState(deltaTime: number, options: UpdateOptions = {}): MoveState {
    const moveState: MoveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false, attack: false };
    const { player } = options;

    switch (this.aiState) {
      case 'idle':
        this.actionTimer -= deltaTime;
        if (this.actionTimer <= 0) {
          this.actionTimer = 5 + Math.random() * 5;
          const resources = this.scene!.children.filter(child =>
            child.userData.isInteractable &&
            child.userData.interactionType === 'gather' &&
            child.visible &&
            this.mesh!.position.distanceTo(child.position) < this.searchRadius
          );
          if (resources.length > 0) {
            this.targetResource = resources[Math.floor(Math.random() * resources.length)];
            this.aiState = 'movingToResource';
          } else {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * this.roamRadius;
            this.destination = this.homePosition.clone().add(new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
            this.destination.y = getTerrainHeight(this.scene!, this.destination.x, this.destination.z); // Ensure destination is on terrain
            this.aiState = 'roaming';
          }
        }
        break;

      case 'roaming':
        if (this.destination) {
          const direction = this.destination.clone().sub(this.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > 0.5) {
            direction.normalize();
            this.lookAt(this.mesh!.position.clone().add(direction));
            moveState.forward = 1;
          } else {
            this.aiState = 'idle';
            this.destination = null;
          }
        } else {
             this.aiState = 'idle'; // Go idle if no destination
        }
        break;

      case 'movingToResource':
        if (this.targetResource && this.targetResource.visible && this.targetResource.userData.isInteractable) {
          const direction = this.targetResource.position.clone().sub(this.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > 1) {
            direction.normalize();
            this.lookAt(this.targetResource.position);
            moveState.forward = 1;
          } else {
            this.aiState = 'gathering';
            this.gatherTimer = 0;
            this.gatherDuration = this.targetResource.userData.gatherTime || 3000;
            this.isGathering = true;
          }
        } else {
          this.aiState = 'idle';
          this.targetResource = null;
        }
        break;

      case 'gathering':
        this.gatherTimer += deltaTime * 1000;
        if (this.gatherTimer >= this.gatherDuration) {
          if (this.targetResource && this.inventory) {
            const resourceName = this.targetResource.userData.resource;
            this.inventory.addItem(resourceName, 1);
            // Log gather event
            if (this.game) {
              this.game.logEvent(this, "gather", `${this.name} gathered 1 ${resourceName}.`, undefined, { resource: resourceName }, this.mesh!.position);
            }
          }
          if (this.targetResource?.userData.isDepletable) {
            this.targetResource.visible = false;
            this.targetResource.userData.isInteractable = false;
            const respawnTime = this.targetResource.userData.respawnTime || 15000;
            const resourceToRespawn = this.targetResource; // Capture the resource
            setTimeout(() => {
              if (resourceToRespawn && resourceToRespawn.userData) {
                resourceToRespawn.visible = true;
                resourceToRespawn.userData.isInteractable = true;
                // Log respawn event? Maybe not necessary for AI observation
              }
            }, respawnTime);
          }
          this.targetResource = null;
          this.aiState = 'idle';
          this.isGathering = false;
        }
        break;
    }

    return moveState;
  }

  // Interaction (from NPC)
  interact(player: Character): { type: string; text: string; state: string; options?: string[] } | null {
    this.lookAt(player.mesh!.position);
    const dialogue = this.getRandomIdleDialogue();
    this.aiState = 'idle'; // Go idle when interacted with
    if (this.game) this.game.logEvent(this, "interact", `${this.name}: "${dialogue}"`, player.name, { dialogue }, this.mesh!.position);
    return { type: 'dialogue', text: dialogue, state: 'greeting', options: ['Switch Control'] };
  }

  getRandomIdleDialogue(): string {
    const dialogues = [
      "Nice weather today.", "Be careful out there.", "Seen any troublemakers around?",
      "The wilderness holds many secrets.", "Welcome to our village.", "Need something?",
      "Don't wander too far from the village."
    ];
    return dialogues[Math.floor(Math.random() * dialogues.length)];
  }

  // New method to update observation
  updateObservation(allEntities: Array<any>, searchRadius: number): void {
    const nearbyCharacters: Observation['nearbyCharacters'] = [];
    const nearbyObjects: Observation['nearbyObjects'] = [];
    const selfPosition = this.mesh!.position;
    const searchRadiusSq = searchRadius * searchRadius;

    for (const entity of allEntities) {
      if (entity === this || entity === this.mesh) continue; // Skip self

      const entityMesh = (entity instanceof Entity || entity instanceof Object3D) ? (entity as any).mesh ?? entity : null;
      if (!entityMesh || !entityMesh.parent) continue; // Skip entities without mesh or not in scene

      const entityPosition = entityMesh.position;
      const distanceSq = selfPosition.distanceToSquared(entityPosition);

      if (distanceSq > searchRadiusSq) continue; // Skip entities outside radius

      if (entity instanceof Character) {
        nearbyCharacters.push({
          id: entity.id,
          position: entityPosition.clone(),
          health: entity.health,
          isDead: entity.isDead,
          currentAction: entity.aiState || (entity === this.game?.activeCharacter ? 'player_controlled' : 'unknown'), // Use aiState or indicate player control
        });
      } else if (entity.userData?.isInteractable && entity.visible) { // Check visibility for objects
        nearbyObjects.push({
          id: entity.userData.id || entity.uuid, // Use userData.id or uuid
          type: entity.name || 'unknown',
          position: entityPosition.clone(),
          isInteractable: entity.userData.isInteractable,
          resource: entity.userData.resource,
        });
      }
    }

    this.observation = {
      timestamp: Date.now(),
      nearbyCharacters,
      nearbyObjects,
    };
  }
}