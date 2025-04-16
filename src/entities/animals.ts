/* File: /src/entities/animals.ts */
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
  Object3D,
  SkinnedMesh,
  MathUtils,
  Raycaster, // Import Raycaster
} from "three";
import {
  EventLog,
  Inventory,
  UpdateOptions,
  MoveState,
  getTerrainHeight,
  InteractionResult,
} from "../core/utils";
import { AnimalAIController } from "../ai/animalAI";
import { Entity } from "../entities/entitiy";
import { Character } from "./character";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS } from "../core/constants"; // Use character constants for now
import {
  createAnimalIdleAnimation,
  createAnimalWalkAnimation,
  createAnimalRunAnimation,
  createAnimalAttackAnimation,
  createAnimalDieAnimation,
} from "../core/animalAnimations"; // Import animal animation generation functions

export class Animal extends Entity {
  animalType: string;
  walkSpeed: number;
  runSpeed: number;
  moveState: MoveState;
  mixer: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  attackAction?: AnimationAction;
  dieAction?: AnimationAction;
  attackTriggered: boolean = false;
  currentAction?: AnimationAction;
  actionType: string = "none";
  isPerformingAction: boolean = false;
  skeletonRoot: Object3D | null = null; // Store the root for animation generation
  aiController: AnimalAIController | null = null; // Specific AI controller
  respawnDelay: number = 20000; // 30 seconds respawn delay
  lastAttacker: Entity | null = null; // Track the last attacker

  constructor(
    scene: Scene,
    position: Vector3,
    name: string,
    animalType: string,
    model: Group, // This is the mixer root
    animations: AnimationClip[] // Existing animations from GLTF if any
  ) {
    super(scene, position, name);
    this.animalType = animalType;
    this.userData.isCollidable = true;
    this.userData.isInteractable = true; // Animals can be targeted for attack
    this.userData.interactionType = "attack"; // Primary interaction is attack
    this.userData.isAnimal = true;
    this.userData.animalType = animalType;
    this.userData.isAggressive = animalType === "Wolf"; // Example property
    this.homePosition = position.clone(); // Store initial position for respawn

    this.maxHealth = animalType === "Wolf" ? 80 : 50; // Example health
    this.health = this.maxHealth;

    // Speeds based on type (example)
    this.walkSpeed = animalType === "Wolf" ? 1.5 : 2.0;
    this.runSpeed = animalType === "Wolf" ? 3.0 : 4.0;

    this.moveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false,
      attack: false,
    };

    // Find skeleton root (primarily for reference, maybe not needed for generators)
    if (model.userData.skeletonRoot) {
      this.skeletonRoot = model.userData.skeletonRoot;
    } else {
      // Fallback: try finding it manually (less reliable for procedural)
      model.traverse((child) => {
        if (child.type === "Bone" && !this.skeletonRoot) {
          let current: Object3D = child;
          while (
            current.parent &&
            !(current.parent instanceof Scene) &&
            !(current.parent === model)
          ) {
            if (
              current.parent instanceof Object3D &&
              current.parent.type !== "Scene"
            ) {
              current = current.parent;
            } else {
              break;
            }
          }
          if (current !== child) {
            this.skeletonRoot = current;
          }
        }
      });
      if (!this.skeletonRoot) {
        this.skeletonRoot = model; // Less ideal fallback
        console.warn(
          `Could not reliably find skeleton root for ${name}, using model root. Procedural animations might be incorrect.`
        );
      }
    }

    // --- Model Scaling and Positioning ---
    // Use approximate animal size, adjust as needed
    let approxHeight = animalType === "Wolf" ? 1.3 : 1.8;
    let approxRadius = animalType === "Wolf" ? 0.3 : 0.4;

    approxHeight = animalType === "Deer" ? 1.5 : 2.0;

    // Calculate bounding box *after* adding the skeleton/meshes to the group in animalModels.ts
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const currentHeight = size.y;
    const scale =
      approxHeight / (currentHeight > 0.1 ? currentHeight : approxHeight);

    // Apply scale to the main group
    model.scale.set(scale, scale, scale);

    // Adjust position based on the *new* scaled bounding box minimum y
    // We need to recompute the box after scaling
    const scaledBox = new Box3().setFromObject(model);
    model.position.y = -scaledBox.min.y; // Adjust to place bottom at origin

    this.mesh!.add(model); // Add the scaled and positioned model group

    // Enable shadow casting
    model.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true; // Animals might receive shadows
      }
    });

    // --- Animation Setup ---
    this.mixer = new AnimationMixer(model); // Mixer targets the main model group

    // Generator function now expects the mixer root (model group)
    const getOrCreateAnimalAnimation = (
      nameIdentifier: string,
      generator: (mixerRoot: Object3D) => AnimationClip // Changed parameter name/meaning
    ): AnimationClip | null => {
      // ... (implementation remains the same)
      const foundAnim = animations.find((anim) =>
        anim.name.toLowerCase().includes(nameIdentifier)
      );
      if (foundAnim) {
        console.log(
          `Using existing "${nameIdentifier}" animation for ${this.name}.`
        );
        return foundAnim;
      } else {
        // Always try to generate if not found
        console.log(
          `Generating fallback "${nameIdentifier}" animation for ${this.name}.`
        );
        try {
          // Pass the mixer root (the main model group) to the generator
          const generatedAnim = generator(model); // <--- Pass model (Group) here
          return generatedAnim;
        } catch (error) {
          console.error(
            `Error generating ${nameIdentifier} animation for ${this.name}:`,
            error
          );
          return null;
        }
      }
    };

    // Call generators (they now receive the 'model' group)
    const idleAnim = getOrCreateAnimalAnimation(
      "idle",
      createAnimalIdleAnimation
    );
    const walkAnim = getOrCreateAnimalAnimation(
      "walk",
      createAnimalWalkAnimation
    );
    const runAnim = getOrCreateAnimalAnimation("run", createAnimalRunAnimation);
    const attackAnim = getOrCreateAnimalAnimation(
      "attack",
      createAnimalAttackAnimation
    );
    const dieAnim = getOrCreateAnimalAnimation("die", createAnimalDieAnimation); // Or 'death'

    if (idleAnim) this.idleAction = this.mixer.clipAction(idleAnim);
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
    }
    if (dieAnim) {
      this.dieAction = this.mixer.clipAction(dieAnim);
      this.dieAction.setLoop(LoopOnce, 1);
      this.dieAction.clampWhenFinished = true;
    }

    if (this.idleAction) {
      this.switchAction(this.idleAction);
    } else {
      console.error(`Animal ${this.name} has no idle animation!`);
    }

    // Use approximate size for bounding box
    this.userData.height = approxHeight;
    this.userData.radius = approxRadius;
    this.updateBoundingBox(); // Update box after scaling and adding model

    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.attackAction) {
        this.isPerformingAction = false;
        this.actionType = "none";
        // If AI still wants to attack, allow next update loop to trigger it
        if (this.moveState.attack) {
          // No need to replay animation here, update loop will handle it
        } else {
          // If AI stopped attacking, transition back to idle/move
          this.transitionToLocomotion();
        }
      }
      // Death animation clamps, no transition needed
    });

    // Initialize AI
    this.aiController = new AnimalAIController(this);
    this.rayCaster = new Raycaster(); // Initialize Raycaster

    // Initialize name display for the animal
    this.initNameDisplay();
  }

  // Helper to transition from an action back to idle/walk/run
  transitionToLocomotion(): void {
    if (this.isDead) return;
    const isMoving =
      Math.abs(this.moveState.forward) > 0.1 ||
      Math.abs(this.moveState.right) > 0.1;
    let targetAction: AnimationAction | undefined;

    if (isMoving) {
      // Use run animation if sprinting (or if animals always run)
      targetAction =
        this.moveState.sprint && this.runAction
          ? this.runAction
          : this.walkAction;
      // Fallback if run/walk is missing
      if (!targetAction) targetAction = this.runAction || this.walkAction;
    } else {
      targetAction = this.idleAction;
    }

    // Ensure we have a valid action to switch to
    if (!targetAction && this.idleAction) {
      targetAction = this.idleAction;
    }

    this.switchAction(targetAction);
  }

  switchAction(newAction: AnimationAction | undefined): void {
    if (this.isDead && newAction !== this.dieAction) return;
    if (!newAction) return;

    if (newAction === this.currentAction) {
      if (!newAction.isRunning()) newAction.play();
      return;
    }

    const fadeDuration = 0.2;
    if (this.currentAction) {
      if (this.currentAction.loop === LoopRepeat) {
        this.currentAction.fadeOut(fadeDuration);
      } else {
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
    // Use AI's attack range + a small buffer for the raycast
    const range = (this.aiController?.attackRange ?? 2.0) + 0.5;
    const damage = this.animalType === "Wolf" ? 15 : 5; // Example damage
    if (
      !this.mesh ||
      !this.scene ||
      !this.game ||
      this.isDead ||
      !this.rayCaster ||
      !this.aiController // Need AI controller for logging check
    )
      return;

    const attackOrigin = this.mesh.position
      .clone()
      .add(new Vector3(0, (this.userData.height ?? 0.8) * 0.5, 0)); // Mid-body approx
    const attackDirection = this.mesh.getWorldDirection(new Vector3());

    this.rayCaster.set(attackOrigin, attackDirection);
    this.rayCaster.far = range;

    // Check against interactable objects (only Entities for animals)
    const potentialTargets = this.game.entities.filter(
      (item): item is Entity =>
        item instanceof Entity && // Must be an entity
        item !== this && // Not self
        !item.isDead && // Must be alive
        item.mesh !== null && // Must have a mesh
        item.mesh.visible // Must be visible
    );

    let closestTarget: Entity | null = null;
    let closestPoint: Vector3 | null = null;
    let minDistanceSq = range * range;
    const intersectionPoint = new Vector3(); // Reusable vector for intersection point

    for (const target of potentialTargets) {
      const targetMesh = target.mesh!;
      const boundingBox = target.userData.boundingBox as Box3 | undefined;

      if (!boundingBox || boundingBox.isEmpty()) {
        // console.warn(`Skipping attack check for ${target.name}: Missing or empty bounding box.`);
        continue; // Skip if no valid bounding box
      }

      // Check for intersection with the bounding box
      if (this.rayCaster.ray.intersectsBox(boundingBox)) {
        // Calculate the intersection point
        if (this.rayCaster.ray.intersectBox(boundingBox, intersectionPoint)) {
          const distanceSq = attackOrigin.distanceToSquared(intersectionPoint);

          // Check if within range and closer than previous hits
          if (distanceSq < minDistanceSq) {
            minDistanceSq = distanceSq;
            closestTarget = target;
            closestPoint = intersectionPoint.clone(); // Clone the point
          }
        }
      }
    }

    // If a target was hit within range
    if (closestTarget && closestPoint) {
      // Apply damage
      closestTarget.takeDamage(damage, this, closestPoint); // Pass hit location

      // Log the hit only if the target is different from the last logged one
      if (
        this.game &&
        this.aiController.lastLoggedAttackTargetId !== closestTarget.id
      ) {
        this.game.logEvent(
          this,
          "attack_hit",
          `${this.name} attacked ${closestTarget.name}.`,
          closestTarget,
          { damage: damage },
          this.mesh!.position
        );
        this.aiController.lastLoggedAttackTargetId = closestTarget.id; // Update last logged target
      }
    } else {
      // Attack missed
      // Log the miss only if the last logged event wasn't already a miss
      if (this.game && this.aiController.lastLoggedAttackTargetId !== "miss") {
        console.warn(`${this.name} attacked but hit nothing.`);
        this.game.logEvent(
          this,
          "attack_fail",
          `${this.name} attacked but missed.`,
          undefined,
          { reason: "No target in range/LOS" },
          this.mesh!.position
        );
        this.aiController.lastLoggedAttackTargetId = "miss"; // Mark last event as a miss
      }
    }
  }

  handleMovement(deltaTime: number): void {
    if (this.isDead || !this.mesh) return;

    // Get the move state computed by the AI controller
    // Note: The AI controller's logic update is throttled,
    // but movement calculation happens every frame based on the *last computed* state.
    const currentMoveState =
      this.aiController?.computeAIMovement() ?? this.moveState;

    const forward = new Vector3(0, 0, 1).applyQuaternion(this.mesh!.quaternion);
    const moveDirection = new Vector3(
      0,
      0,
      currentMoveState.forward
    ).normalize(); // Only forward/backward based on AI
    const moveVelocity = new Vector3();

    if (moveDirection.lengthSq() > 0) {
      const currentSpeed = currentMoveState.sprint
        ? this.runSpeed
        : this.walkSpeed;
      moveVelocity.addScaledVector(forward, moveDirection.z * currentSpeed);
    }

    this.velocity.x = moveVelocity.x;
    this.velocity.z = moveVelocity.z;

    // Update the internal moveState for animation purposes if needed,
    // or rely directly on the computed state for animations.
    // Let's update the internal state for consistency with animation logic.
    this.moveState = currentMoveState;
  }

  updateAnimations(deltaTime: number): void {
    this.mixer.update(deltaTime);

    if (this.isDead) {
      if (this.currentAction !== this.dieAction && this.dieAction) {
        this.switchAction(this.dieAction);
      }
      return;
    }

    // Check if an attack was triggered in the current move state
    if (
      this.moveState.attack &&
      !this.isPerformingAction &&
      this.attackAction
    ) {
      this.triggerAction("attack"); // Trigger the attack animation and ilogic
    }
    // If performing an attack, let the animation play out (handled by 'finished' listener)
    else if (this.isPerformingAction && this.actionType === "attack") {
      // Do nothing here, wait for animation to finish
    }
    // Otherwise, handle locomotion (idle/walk/run)
    else {
      this.transitionToLocomotion(); // Uses this.moveState to decide animation
    }
  }

  triggerAction(actionType: string): void {
    if (this.isDead || this.isPerformingAction) return;

    if (actionType === "attack" && this.attackAction) {
      this.actionType = actionType;
      this.isPerformingAction = true;
      this.switchAction(this.attackAction);
      this.performAttack(); // Execute the attack logic immediately
    }
    // Add other actions like 'flee' or 'graze' if needed
  }

  // Main update loop for the animal
  update(deltaTime: number, options: UpdateOptions = {}): void {
    // AI Logic update is handled by the main game loop's throttling mechanism
    // calling aiController.updateLogic()

    if (this.isDead) {
      this.updateAnimations(deltaTime); // Update mixer for death animation
      // No movement or other updates if dead
      this.velocity.set(0, 0, 0); // Ensure velocity is zero
      return;
    }

    // Calculate movement based on the AI's *current* state
    this.handleMovement(deltaTime); // Sets this.velocity based on AI state

    // Apply velocity to position
    if (this.mesh) {
      this.mesh.position.x += this.velocity.x * deltaTime;
      this.mesh.position.z += this.velocity.z * deltaTime;

      // Ground clamping
      if (this.scene) {
        const groundY = getTerrainHeight(
          this.scene,
          this.mesh.position.x,
          this.mesh.position.z
        );
        // Smoothly adjust height to avoid jittering on slopes
        const lerpFactor = 1 - Math.pow(0.1, deltaTime); // Adjust 0.1 for faster/slower smoothing
        this.mesh.position.y = MathUtils.lerp(
          this.mesh.position.y,
          groundY,
          lerpFactor
        );
        // this.mesh.position.y = groundY; // Simple ground clamp
      }
    }
    this.velocity.y = 0; // Reset vertical velocity after clamping/lerping

    // Update animations based on the current move state (set in handleMovement)
    this.updateAnimations(deltaTime);

    // Update bounding box after position change
    this.updateBoundingBox();
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;

    const deathPosition = this.mesh!.position.clone(); // Store position before super.die() potentially changes things
    this.lastAttacker = attacker; // Store the attacker

    super.die(attacker); // Sets this.isDead = true, stops velocity, etc.

    // AI specific state change
    if (this.aiController) this.aiController.setState("dead"); // Use setState

    // Reset action states
    this.isPerformingAction = false;
    this.actionType = "none";

    // Play death animation
    if (this.dieAction) {
      this.switchAction(this.dieAction);
    } else {
      // Fallback: Rotate model onto side
      this.mesh?.rotateX(Math.PI / 2);
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
        deathPosition
      );

      // Increment kill count if it's a wolf
      if (this.animalType === "Wolf") {
        this.game.wolfKillCount++;
        console.log(`Wolf kill count: ${this.game.wolfKillCount}`);
      }

      // --- Drop Loot ---
      let itemId = "meat";
      let count = 0;
      if (this.animalType === "Wolf") {
        count = MathUtils.randInt(1, 2);
      } else if (this.animalType === "Deer") {
        count = MathUtils.randInt(2, 4);
      }

      if (itemId && count > 0) {
        // Drop the item into the world using the game's manager
        this.game.dropItem(itemId, count, deathPosition);
        console.log(
          `${this.name} dropped ${count}x ${itemId} at ${deathPosition.x.toFixed(1)}, ${deathPosition.y.toFixed(1)}, ${deathPosition.z.toFixed(1)}`
        );
      }
    }
  }

  respawn(): void {
    if (!this.homePosition || !this.scene) {
      console.warn(
        `Cannot respawn ${this.name}: Missing home position or scene.`
      );
      return;
    }

    // Reset state
    this.health = this.maxHealth;
    this.velocity.set(0, 0, 0);
    this.isDead = false;
    this.deathTimestamp = null;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.lastAttacker = null; // Reset attacker on respawn

    // Reset position to home position + terrain height
    const respawnY = getTerrainHeight(
      this.scene,
      this.homePosition.x,
      this.homePosition.z
    );
    this.setPosition(this.homePosition.clone().setY(respawnY));
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;
    this.mesh!.visible = true; // Make sure mesh is visible

    // Reset AI state
    if (this.aiController) {
      this.aiController.homePosition.copy(this.homePosition); // Ensure AI home is updated
      this.aiController.setState("idle");
    }

    // Reset animations
    this.mixer.stopAllAction();
    if (this.idleAction) {
      this.switchAction(this.idleAction);
    } else {
      console.error(`Animal ${this.name} cannot respawn to idle animation!`);
    }

    // Logging
    if (this.game) {
      this.game.logEvent(
        this,
        "respawn",
        `${this.name} respawned.`,
        undefined,
        {},
        this.mesh!.position.clone()
      );
    }

    this.updateBoundingBox();
    this.initNameDisplay(); // Re-initialize name display
  }
}
