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
  LoopRepeat,
  SkeletonHelper, // For debugging
  Bone,
  SkinnedMesh,
  Object3D,
  Raycaster, // Import Raycaster
  Sprite, // Import Sprite for filtering
} from "three";
import {
  EventLog,
  Inventory,
  UpdateOptions,
  MoveState,
  getTerrainHeight,
  InteractionResult,
} from "../core/utils";
import { AIController } from "../ai/npcAI";
import { Entity } from "../entities/entitiy";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS } from "../core/constants";
import {
  createIdleAnimation,
  createWalkAnimation,
  createRunAnimation,
  createAttackAnimation,
  createDeadAnimation,
} from "../core/animations"; // Import animation generation functions
import { AnimalAIController } from "../ai/animalAI";
import { Animal } from "./animals"; // Import Animal for type checking

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
  deadAction?: AnimationAction;
  searchRadius: number = 30;
  roamRadius: number = 10;
  attackTriggered: boolean = false; // Still needed for player input debounce
  inventory: Inventory | null;
  persona: string = "";
  currentAction?: AnimationAction;
  actionType: string = "none"; // "attack", "chat", "none"
  isPerformingAction: boolean = false; // Primarily for one-shot actions like attack
  skeletonRoot: Object3D | null = null; // Store the root for animation generation
  deathTimestamp: number | null = null;
  aiController: AIController | null;

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
    this.userData.isInteractable = true; // Can be targeted for chat or attack
    this.userData.interactionType = "talk"; // Default interaction is talk
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
      interact: false, // 'E' key for chat
      attack: false, // 'F' key / mouse for attack/gather
    };
    this.inventory = inventory;
    this.eventLog = new EventLog(50);
    this.rayCaster = new Raycaster(); // Initialize Raycaster here
    this.aiController = new AIController(this);

    // Find the actual mesh with bones for animation
    let skinnedMesh: SkinnedMesh | null = null;
    model.traverse((child) => {
      if (child instanceof SkinnedMesh) {
        skinnedMesh = child;
      }
      if (child instanceof Bone && !this.skeletonRoot) {
        // Find the root of the skeleton hierarchy
        let current: Object3D = child;
        while (
          current.parent &&
          !(current.parent instanceof Scene) &&
          !(current.parent === model)
        ) {
          if (
            current.parent instanceof Bone ||
            current.parent?.type === "Object3D"
          ) {
            // Check common rig structures
            current = current.parent;
          } else {
            break; // Stop if parent is not a typical rig node
          }
        }
        // Heuristic: Assume the highest Bone or Object3D parent under the main model group is the root
        if (current !== child) {
          // Make sure we moved up
          this.skeletonRoot = current;
        }
      }
    });

    // If skeletonRoot wasn't found via Bone traversal, assume the model itself is the root
    if (!this.skeletonRoot) {
      this.skeletonRoot = model;
      console.warn(
        `Could not reliably find skeleton root for ${name}, using model root. Procedural animations might be incorrect.`
      );
    }

    // Scale and position model
    const box = new Box3().setFromObject(model);
    const currentHeight = box.max.y - box.min.y;
    const scale =
      CHARACTER_HEIGHT /
      (currentHeight > 0.1 ? currentHeight : CHARACTER_HEIGHT); // Avoid division by zero/tiny numbers
    model.scale.set(scale, scale, scale);
    model.position.y = -box.min.y * scale; // Adjust based on scaled bounding box
    this.mesh!.add(model);

    // Enable shadow casting for all meshes within the character model
    model.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = false; // Characters usually don't receive shadows on themselves
      }
    });

    // --- Animation Setup ---
    this.mixer = new AnimationMixer(model); // Use the main model group for the mixer

    // Helper to find animation or generate fallback
    const getOrCreateAnimation = (
      nameIdentifier: string,
      generator: ((root: Object3D) => AnimationClip) | null
    ): AnimationClip | null => {
      const foundAnim = animations.find((anim) =>
        anim.name.toLowerCase().includes(nameIdentifier)
      );
      if (foundAnim) {
        console.log(
          `Using existing "${nameIdentifier}" animation for ${this.name}.`
        );
        return foundAnim;
      } else if (generator && this.skeletonRoot) {
        console.log(
          `Generating fallback "${nameIdentifier}" animation for ${this.name}.`
        );
        const generatedAnim = generator(this.skeletonRoot);
        // Optional: Add generated animation to the original array if needed elsewhere
        // animations.push(generatedAnim);
        return generatedAnim;
      }
      console.warn(
        `Could not find or generate "${nameIdentifier}" animation for ${this.name}.`
      );
      return null;
    };

    const idleAnim = getOrCreateAnimation("idled", createIdleAnimation);
    const walkAnim = getOrCreateAnimation("walk", createWalkAnimation);
    const runAnim = getOrCreateAnimation("run", createRunAnimation);
    const attackAnim = getOrCreateAnimation("attack", createAttackAnimation);
    const deadAnim = getOrCreateAnimation("dead", createDeadAnimation); // Or 'death'

    if (idleAnim) this.idleAction = this.mixer.clipAction(idleAnim);
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
    }
    if (deadAnim) {
      this.deadAction = this.mixer.clipAction(deadAnim);
      this.deadAction.setLoop(LoopOnce, 1);
      this.deadAction.clampWhenFinished = true;
    }

    if (this.idleAction) {
      this.switchAction(this.idleAction);
    } else {
      console.error(`Character ${this.name} has no idle animation!`);
    }

    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;
    this.updateBoundingBox();

    this.mixer.addEventListener("finished", (e) => {
      // Handle finishing attack actions
      if (e.action === this.attackAction) {
        // Check if attack button is still held (for player chaining)
        const isPlayerHoldingAttack =
          this.userData.isPlayer && this.moveState.attack;

        if (isPlayerHoldingAttack) {
          // Chain attacks if button held
          this.performAttack(); // Perform next attack logic
          this.attackAction?.reset().play(); // Replay animation
        } else if (!this.userData.isPlayer && this.moveState.attack) {
          // NPC continuous attack: If AI still wants to attack, just allow the next update loop to trigger it
          this.isPerformingAction = false; // Allow next trigger
          // No need to replay animation here, update loop will handle it
        } else {
          // If not chaining (player) or AI stopped attacking, transition back to idle/move
          this.isPerformingAction = false;
          this.actionType = "none";
          this.transitionToLocomotion();
        }
      }
      // Handle finishing death animation (it clamps, so no transition needed)
      // if (e.action === this.deadAction) { ... }
    });
  }

  // Helper to transition from an action back to idle/walk/run
  transitionToLocomotion(): void {
    if (this.isDead) return; // Don't transition if dead
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

  switchAction(newAction: AnimationAction | undefined): void {
    if (this.isDead && newAction !== this.deadAction) return; // Only allow dead action if dead
    if (!newAction) return; // Don't switch to nothing

    if (newAction === this.currentAction) {
      if (!newAction.isRunning()) newAction.play();
      return;
    }

    const fadeDuration = 0.2;
    if (this.currentAction) {
      // If the current action is looping (like walk/run/idle), fade it out
      if (this.currentAction.loop === LoopRepeat) {
        this.currentAction.fadeOut(fadeDuration);
      } else {
        // If it's a one-shot action that might still be playing, fade it out.
        this.currentAction.fadeOut(fadeDuration);
      }
    }

    newAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(fadeDuration)
      .play();

    this.currentAction = newAction;
  }

  performAttack(): void {
    const range = 2.5;
    const damage = this.userData.isPlayer ? 40 : 10; // Player deals more damage
    if (
      !this.mesh ||
      !this.scene ||
      !this.game ||
      this.isDead ||
      !this.rayCaster
    )
      return;

    const rayOrigin = this.mesh.position
      .clone()
      .add(new Vector3(0, CHARACTER_HEIGHT / 2, 0));
    let rayDirection = new Vector3();

    // Use camera direction for player, mesh direction for NPC
    if (this.userData.isPlayer && this.game.camera) {
      this.game.camera.getWorldDirection(rayDirection);
    } else {
      this.mesh.getWorldDirection(rayDirection);
    }

    this.rayCaster.set(rayOrigin, rayDirection);
    this.rayCaster.far = range;

    // Check against interactable objects (includes Entities and Resources)
    const potentialTargets = this.game.interactableObjects.filter((item) => {
      if (item === this || item === this.mesh) return false; // Don't target self
      const targetMesh = (item as any).mesh ?? item;
      if (!(targetMesh instanceof Object3D) || !targetMesh.visible)
        return false;
      // Check if entity is dead
      if (item instanceof Entity && item.isDead) return false;
      // Check if resource is depleted (using health)
      if (
        targetMesh.userData.resource &&
        targetMesh.userData.health !== undefined &&
        targetMesh.userData.health <= 0
      )
        return false;
      return true;
    });

    let closestTarget: any | null = null; // Can be Entity or resource Object3D
    let closestPoint: Vector3 | null = null;
    let minDistanceSq = range * range;
    const intersectionPoint = new Vector3(); // Reusable vector for intersection point

    for (const targetInstance of potentialTargets) {
      const targetMesh = (targetInstance as any).mesh ?? targetInstance;
      if (!(targetMesh instanceof Object3D) || targetMesh instanceof Sprite) {
        continue; // Skip if not a valid Object3D or if it's a Sprite
      }

      const boundingBox = targetMesh.userData.boundingBox as Box3 | undefined;
      if (!boundingBox || boundingBox.isEmpty()) {
        console.warn(
          `Skipping attack check for ${targetInstance.name || targetMesh.name}: Missing or empty bounding box.`
        );
        continue; // Skip if no valid bounding box
      }

      // Check for intersection with the bounding box
      if (this.rayCaster.ray.intersectsBox(boundingBox)) {
        // Calculate the intersection point
        if (this.rayCaster.ray.intersectBox(boundingBox, intersectionPoint)) {
          const distanceSq = rayOrigin.distanceToSquared(intersectionPoint);

          // Check if within range and closer than previous hits
          if (distanceSq < minDistanceSq) {
            minDistanceSq = distanceSq;
            closestTarget = targetInstance;
            closestPoint = intersectionPoint.clone(); // Clone the point
          }
        }
      }
    }

    if (closestTarget && closestPoint) {
      const targetMesh = (closestTarget as any).mesh ?? closestTarget;

      // Check if the target is a resource
      if (targetMesh.userData.resource) {
        // this.lookAt(closestTargetposition.clone());

        const resource = targetMesh.userData.resource as string;
        const currentHealth = targetMesh.userData.health as number;
        const maxHealth = targetMesh.userData.maxHealth as number;

        if (currentHealth > 0) {
          const newHealth = Math.max(0, currentHealth - damage);
          targetMesh.userData.health = newHealth;
          this.game.spawnParticleEffect(closestPoint, "red"); // Hit particle

          if (newHealth <= 0) {
            // Resource depleted
            if (this.inventory?.addItem(resource, 1)) {
              this.game.logEvent(
                this,
                "gather_complete", // Log as gather_complete for consistency
                `${this.name} gathered 1 ${resource}.`,
                targetMesh.name || targetMesh.id,
                { resource },
                closestPoint
              );
              this.game.spawnParticleEffect(closestPoint, "green"); // Success particle
            } else {
              this.game.logEvent(
                this,
                "gather_fail",
                `${this.name}'s inventory full, could not gather ${resource}.`,
                targetMesh.name || targetMesh.id,
                { resource },
                closestPoint
              );
            }

            // Handle depletion
            if (targetMesh.userData.isDepletable) {
              targetMesh.userData.isInteractable = false; // Make non-targetable
              targetMesh.userData.isCollidable = false; // Make non-collidable
              targetMesh.visible = false;
              const respawnTime = targetMesh.userData.respawnTime || 15000;
              setTimeout(() => {
                if (targetMesh.userData) {
                  targetMesh.userData.isInteractable = true;
                  targetMesh.userData.isCollidable = true; // Make collidable again
                  targetMesh.userData.health = maxHealth; // Reset health
                  targetMesh.visible = true;
                }
              }, respawnTime);
            }
          }
        }
      } else if (closestTarget instanceof Entity) {
        // Target is another entity (Character or Animal)
        closestTarget.takeDamage(damage, this);
        this.game.spawnParticleEffect(closestPoint, "red"); // Combat hit particle
      }
    }
  }

  handleStamina(deltaTime: number): void {
    if (this.isDead) return;
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
    if (this.isDead) return;
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

    if (this.isDead) {
      if (this.currentAction !== this.deadAction && this.deadAction) {
        this.switchAction(this.deadAction);
      }
      return; // Don't update locomotion/action animations if dead
    }

    // Handle one-shot actions like attack
    if (
      this.isPerformingAction &&
      this.actionType === "attack" &&
      this.attackAction
    ) {
      // Animation is playing, wait for 'finished' event to transition back
      // No need to switch here, the listener handles it.
    }
    // Handle locomotion (idle/walk/run) if not doing a specific action
    else if (!this.isPerformingAction) {
      this.transitionToLocomotion();
    }
  }

  triggerAction(actionType: string): void {
    if (this.isDead || this.isPerformingAction) return; // Prevent actions if dead or already busy

    if (actionType === "attack" && this.attackAction) {
      this.actionType = actionType;
      this.isPerformingAction = true;
      this.switchAction(this.attackAction); // SwitchAction handles reset and play
      this.performAttack(); // Perform the actual attack logic
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) {
      this.updateAnimations(deltaTime);
      return;
    }

    const { moveState, collidables } = options;
    if (!moveState || !collidables) return;

    // Update internal moveState based on input (player) or AI calculation (NPC)
    this.moveState = moveState;

    this.handleStamina(deltaTime);

    // Apply movement unless performing a non-interruptible action
    if (!this.isPerformingAction) {
      this.handleMovement(deltaTime);
    } else {
      // Allow slight movement adjustment during attack? Or freeze? Freeze for now.
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // Apply velocity to position
    this.mesh!.position.x += this.velocity.x * deltaTime;
    this.mesh!.position.z += this.velocity.z * deltaTime;

    // Ground clamping
    if (this.scene) {
      const groundY = getTerrainHeight(
        this.scene,
        this.mesh!.position.x,
        this.mesh!.position.z
      );
      this.mesh!.position.y = groundY;
    }
    this.velocity.y = 0;

    // Handle attack trigger from player input OR AI command
    if (moveState.attack && !this.isPerformingAction) {
      // If attack is commanded and we are not already performing the attack animation
      if (this.userData.isPlayer) {
        // Player attack debounce
        if (!this.attackTriggered) {
          this.attackTriggered = true;
          this.triggerAction("attack");
        }
      } else {
        // NPC attack - trigger directly if not already performing
        this.triggerAction("attack");
      }
    } else if (!moveState.attack && this.userData.isPlayer) {
      // Reset player debounce flag when input stops
      this.attackTriggered = false;
    }

    this.updateAnimations(deltaTime);
    this.updateBoundingBox();
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;

    // Call super.die() first to set basic flags
    super.die(attacker); // Sets this.isDead = true, stops velocity, etc.
    this.deathTimestamp = performance.now(); // Record time of death

    // AI specific state change
    if (this.aiController) this.aiController.aiState = "dead";

    // Reset action states
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false; // Ensure attack can't be triggered

    // Play death animation
    if (this.deadAction) {
      this.switchAction(this.deadAction);
    } else {
      // Fallback if no death animation: maybe rotate the model?
      // this.mesh?.rotateX(Math.PI / 2);
    }

    // Logging
    if (this.game) {
      const message = `${this.name} has died!`;
      const details = attacker ? { killedBy: attacker.name } : {};
      this.game.logEvent(
        this,
        "death",
        message,
        undefined,
        details,
        this.mesh!.position.clone() // Clone position at time of death
      );
      if (attacker instanceof Character) {
        const defeatMessage = `${attacker.name} defeated ${this.name}.`;
        this.game.logEvent(
          attacker,
          "kill",
          defeatMessage,
          this.name,
          {},
          attacker.mesh!.position
        );
      }
    }
  }

  respawn(position: Vector3): void {
    // Reset state before calling super.respawn if it exists, or handle here
    this.health = this.maxHealth * 0.75;
    this.stamina = this.maxStamina;
    this.velocity.set(0, 0, 0);
    this.isDead = false; // Critical: Set isDead back to false
    this.deathTimestamp = null; // Reset death timestamp
    this.isExhausted = false;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;

    // Reset position and collision state
    this.setPosition(position);
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;

    // Reset AI state
    if (this.aiController) {
      this.aiController.aiState = "idle";
      this.aiController.previousAiState = "idle";
      this.aiController.destination = null;
      this.aiController.target = null;
      this.aiController.targetAction = null;
      this.aiController.message = null;
    }

    // Reset animations
    this.mixer.stopAllAction(); // Stop everything first
    if (this.idleAction) {
      this.switchAction(this.idleAction); // Switch back to idle
    } else {
      console.error(`Character ${this.name} cannot respawn to idle animation!`);
    }

    // Logging
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
    if (this.isDead)
      return { type: "error", message: "Cannot interact with the deceased." };
    this.lookAt(player.mesh!.position);
    if (this.game)
      this.game.logEvent(
        player,
        "interact_start",
        `${player.name} started interacting with ${this.name}.`,
        this,
        {},
        player.mesh!.position
      );
    // Only allow chat interaction via 'E' key
    return { type: "chat" };
  }
}
