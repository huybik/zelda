// File: /src/entities/animals.ts
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
  deathTimestamp: number | null = null;
  aiController: AnimalAIController | null = null; // Specific AI controller

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
    this.userData.isInteractable = false; // Animals usually aren't interacted with directly
    this.userData.isAnimal = true;
    this.userData.animalType = animalType;
    this.userData.isAggressive = animalType === "Wolf"; // Example property

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
      // Removed the check for this.skeletonRoot here, generation relies on mixerRoot
      // console.warn(
      //   `Could not find or generate "${nameIdentifier}" animation for ${this.name}.`
      // );
      // return null; // Redundant now
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
        this.transitionToLocomotion();
      }
      // Death animation clamps, no transition needed
    });

    // Initialize AI
    this.aiController = new AnimalAIController(this);

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
    const range = 2.5; // Shorter range for animals?
    const damage = this.animalType === "Wolf" ? 5 : 2; // Example damage
    if (!this.mesh || !this.scene || !this.game || this.isDead) return;

    const attackOrigin = this.mesh.position
      .clone()
      .add(new Vector3(0, (this.userData.height ?? 0.8) * 0.5, 0)); // Mid-body approx
    const attackDirection = this.mesh.getWorldDirection(new Vector3());

    // Simple sphere overlap check for nearby targets
    const potentialTargets = this.game.entities.filter(
      (
        entity
      ): entity is Entity => // Target Characters or other Entities
        entity instanceof Entity &&
        entity !== this &&
        !entity.isDead &&
        entity.mesh !== null &&
        entity.mesh.position.distanceToSquared(attackOrigin) < range * range
    );

    let targetHit = false;
    for (const target of potentialTargets) {
      // Check if target is roughly in front
      const directionToTarget = target
        .mesh!.position.clone()
        .sub(attackOrigin)
        .normalize();
      const dot = attackDirection.dot(directionToTarget);
      if (dot > 0.7) {
        // Target is roughly in front (adjust dot product threshold as needed)
        target.takeDamage(damage, this);
        this.game.spawnParticleEffect(target.mesh!.position, "red");
        targetHit = true;
        // Hit one target, could break or continue to hit multiple
        break;
      }
    }

    if (targetHit && this.game) {
      this.game.logEvent(
        this,
        "attack_hit",
        `${this.name} attacked.`,
        undefined, // Target info is in takeDamage log
        { damage: damage },
        this.mesh.position
      );
    }
  }

  handleMovement(deltaTime: number): void {
    if (this.isDead) return;

    const forward = new Vector3(0, 0, 1).applyQuaternion(this.mesh!.quaternion);
    // Animals typically don't strafe, so 'right' might not be needed from AI state
    // const right = new Vector3(1, 0, 0).applyQuaternion(this.mesh!.quaternion);

    const moveDirection = new Vector3(0, 0, this.moveState.forward).normalize(); // Only forward/backward based on AI
    const moveVelocity = new Vector3();

    if (moveDirection.lengthSq() > 0) {
      const currentSpeed = this.moveState.sprint
        ? this.runSpeed
        : this.walkSpeed;
      moveVelocity.addScaledVector(forward, moveDirection.z * currentSpeed);
    }

    this.velocity.x = moveVelocity.x;
    this.velocity.z = moveVelocity.z;
  }

  updateAnimations(deltaTime: number): void {
    this.mixer.update(deltaTime);

    if (this.isDead) {
      if (this.currentAction !== this.dieAction && this.dieAction) {
        this.switchAction(this.dieAction);
      }
      return;
    }

    if (
      this.isPerformingAction &&
      this.actionType === "attack" &&
      this.attackAction
    ) {
      // Attack animation is playing, wait for 'finished' event
    } else {
      // Handle locomotion (idle/walk/run)
      this.transitionToLocomotion();
    }
  }

  triggerAction(actionType: string): void {
    if (this.isDead || this.isPerformingAction) return;

    if (actionType === "attack" && this.attackAction) {
      this.actionType = actionType;
      this.isPerformingAction = true;
      this.switchAction(this.attackAction);
      this.performAttack();
    }
    // Add other actions like 'flee' or 'graze' if needed
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) {
      this.updateAnimations(deltaTime); // Update mixer for death animation
      return;
    }

    // AI Controller should have updated this.moveState externally via main loop throttling

    // Apply movement based on the current this.moveState
    if (!this.isPerformingAction) {
      this.handleMovement(deltaTime); // Uses this.moveState
    } else {
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
    this.velocity.y = 0; // Reset vertical velocity

    // Handle attack trigger from the current this.moveState
    if (this.moveState.attack && !this.attackTriggered) {
      this.attackTriggered = true;
      if (!this.isPerformingAction) {
        this.triggerAction("attack");
      }
    } else if (!this.moveState.attack) {
      this.attackTriggered = false;
    }

    this.updateAnimations(deltaTime); // Uses this.moveState
    this.updateBoundingBox();
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;

    super.die(attacker); // Sets this.isDead = true, stops velocity, etc.
    this.deathTimestamp = performance.now();

    // AI specific state change
    if (this.aiController) this.aiController.aiState = "dead";

    // Reset action states
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;

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
        this.mesh!.position.clone()
      );
      // Could add loot drop logic here
    }
  }

  // Animals typically don't respawn, but method could be added if needed
  // respawn(position: Vector3): void { ... }

  // Override interact if needed, default is likely fine (non-interactable)
  // interact(player: Character): InteractionResult | null { ... }
}
