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
import {
  createIdleAnimation,
  createWalkAnimation,
  createRunAnimation,
  createAttackAnimation,
  createGatherAnimation, // Assuming gather uses attack for now
  createDeadAnimation,
} from "../core/animations"; // Import animation generation functions

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
  gatherAction?: AnimationAction; // Can reuse attack or be specific
  deadAction?: AnimationAction;
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
  skeletonRoot: Object3D | null = null; // Store the root for animation generation

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
      generator: (root: Object3D) => AnimationClip
    ): AnimationClip | null => {
      const foundAnim = animations.find((anim) =>
        anim.name.toLowerCase().includes(nameIdentifier)
      );
      if (foundAnim) {
        console.log(
          `Using existing "${nameIdentifier}" animation for ${this.name}.`
        );
        return foundAnim;
      } else if (this.skeletonRoot) {
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
    // For now, gather uses attack animation logic, but we could generate a specific one:
    // const gatherAnim = getOrCreateAnimation('gather', createGatherAnimation);
    const deadAnim = getOrCreateAnimation("dead", createDeadAnimation); // Or 'death'

    if (idleAnim) this.idleAction = this.mixer.clipAction(idleAnim);
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
      // Use attack animation for gather as well for now
      this.gatherAction = this.attackAction;
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
      // Handle finishing attack/gather actions
      if (e.action === this.attackAction || e.action === this.gatherAction) {
        if (this.moveState.attack && e.action === this.attackAction) {
          // Chain attacks if button held (only for attack, not gather)
          this.performAttack();
          this.attackAction?.reset().play();
        } else if (!this.isGathering) {
          // If not gathering or chaining attacks, transition back to idle/move
          this.isPerformingAction = false;
          this.actionType = "none";
          this.transitionToLocomotion();
        }
        // If gathering, the gathering logic handles the state transition
      }
      // Handle finishing death animation (it clamps, so no transition needed)
      // if (e.action === this.deadAction) { ... }
    });

    if (this.userData.isNPC) this.aiController = new AIController(this);
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
        // If it's a one-shot action that might still be playing, stop it abruptly before fading? Or let fadeOut handle it.
        this.currentAction.fadeOut(fadeDuration); // Fade out might be smoother
        // this.currentAction.stop(); // Alternative: Stop immediately
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
    const range = 2.0;
    const damage = this.name === "Player" ? 40 : 10;
    if (!this.mesh || !this.scene || !this.game || this.isDead) return;

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

    // Handle gathering animation loop (using attack/gather action)
    if (this.isGathering && this.gatherAction) {
      this.gatherAttackTimer += deltaTime;
      if (this.gatherAttackTimer >= this.gatherAttackInterval) {
        // Play the gather/attack animation
        this.switchAction(this.gatherAction); // Will reset and play if not already playing
        this.gatherAttackTimer = 0; // Reset timer for next swing
      } else if (
        !this.gatherAction.isRunning() && // If the action finished before interval
        this.currentAction !== this.idleAction // And we are not already idle
      ) {
        // Switch back to idle between gather swings
        this.switchAction(this.idleAction);
      }
    }
    // Handle one-shot actions like attack (if not gathering)
    else if (
      this.isPerformingAction &&
      this.actionType === "attack" &&
      this.attackAction
    ) {
      // Animation is playing, wait for 'finished' event to transition back
      // No need to switch here, the listener handles it.
    }
    // Handle locomotion (idle/walk/run) if not doing a specific action
    else if (!this.isPerformingAction && !this.isGathering) {
      this.transitionToLocomotion();
    }
  }

  triggerAction(actionType: string): void {
    if (this.isDead || this.isPerformingAction || this.isGathering) return; // Prevent actions if dead or already busy

    if (actionType === "attack" && this.attackAction) {
      this.actionType = actionType;
      this.isPerformingAction = true;
      this.switchAction(this.attackAction); // SwitchAction handles reset and play
      this.performAttack(); // Perform the actual attack logic
    } else if (actionType === "gather" && this.gatherAction) {
      // Note: 'gather' state is primarily managed by InteractionSystem's activeGather
      // This trigger is mainly for the animation aspect within Character
      this.actionType = actionType;
      // isGathering flag is set by InteractionSystem
      this.switchAction(this.gatherAction); // Start the animation
      this.gatherAttackTimer = 0; // Reset timer for the first swing
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) {
      this.updateAnimations(deltaTime); // Still update mixer for death animation
      return;
    }

    const { moveState, collidables } = options;
    if (!moveState || !collidables) return;

    this.moveState = moveState; // Update internal move state

    this.handleStamina(deltaTime);

    // Apply movement only if not performing a blocking action (like attack wind-up/swing)
    // Gathering allows movement cancellation but doesn't block initial movement input handling here.
    if (!this.isPerformingAction) {
      this.handleMovement(deltaTime);
    } else {
      // If performing an action, usually stop movement
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
      this.mesh!.position.y = groundY; // Simple ground clamp
    }
    this.velocity.y = 0; // Reset vertical velocity after clamping

    // Handle attack trigger
    if (moveState.attack && !this.attackTriggered) {
      this.attackTriggered = true;
      // Only trigger if not already gathering or performing another action
      if (!this.isGathering && !this.isPerformingAction) {
        this.triggerAction("attack");
      }
    } else if (!moveState.attack) {
      this.attackTriggered = false;
    }

    this.updateAnimations(deltaTime);
    this.updateBoundingBox(); // Update bounding box after position change
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;

    // Call super.die() first to set basic flags
    super.die(attacker); // Sets this.isDead = true, stops velocity, etc.

    // AI specific state change
    if (this.aiController) this.aiController.aiState = "dead";

    // Reset action states
    this.isGathering = false;
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
    // Reset state before calling super.respawn if it exists, or handle here
    this.health = this.maxHealth * 0.75;
    this.stamina = this.maxStamina;
    this.velocity.set(0, 0, 0);
    this.isDead = false; // Critical: Set isDead back to false
    this.isExhausted = false;
    this.isGathering = false;
    this.gatherAttackTimer = 0;
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
      this.aiController.targetResource = null;
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
        `Started interacting with ${this.name}.`,
        this,
        {},
        player.mesh!.position
      );
    return { type: "chat" };
  }
}
