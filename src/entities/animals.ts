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
import {
  switchAction,
  transitionToLocomotion,
  playAttackAnimation as playAttackAnimationUtil,
  updateAnimations as updateAnimationsUtil,
} from "../components/animationUtils";
import {
  handleMovement as handleMovementUtil,
  applyMovement,
} from "../components/movementUtils";

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
  dieAction?: AnimationAction; // Renamed from deadAction for consistency
  attackTriggered: boolean = false;
  currentAction?: AnimationAction;
  actionType: string = "none";
  // isPerformingAction: boolean = false; // Inherited from Entity
  skeletonRoot: Object3D | null = null; // Store the root for animation generation
  aiController: AnimalAIController | null = null; // Specific AI controller
  respawnDelay: number = 20000; // 30 seconds respawn delay
  // lastAttacker: Entity | null = null; // Inherited from Entity
  // attackCooldown: number = 1.5; // Inherited from Entity
  // lastAttackTime: number = 0; // Inherited from Entity

  // Make deadAction an alias for dieAction for compatibility with animationUtils
  get deadAction(): AnimationAction | undefined {
    return this.dieAction;
  }

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
      this.attackCooldown = this.attackAction.getClip().duration * 0.9; // Set cooldown based on animation
    }
    if (dieAnim) {
      this.dieAction = this.mixer.clipAction(dieAnim);
      this.dieAction.setLoop(LoopOnce, 1);
      this.dieAction.clampWhenFinished = true;
    }

    if (this.idleAction) {
      switchAction(this, this.idleAction);
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
        // Transition back to locomotion immediately after attack finishes
        transitionToLocomotion(this, this.moveState);
      }
      // Death animation clamps, no transition needed
    });

    // Initialize AI
    this.aiController = new AnimalAIController(this);
    this.rayCaster = new Raycaster(); // Initialize Raycaster

    // Initialize name display for the animal
    this.initNameDisplay();
  }

  // Delegate animation switching
  playAttackAnimation(): void {
    playAttackAnimationUtil(this);
  }

  getAttackDamage(): number {
    return this.animalType === "Wolf" ? 15 : 5; // Example damage
  }

  getAttackRange(): number {
    return this.aiController?.attackRange ?? 2.0;
  }

  // Delegate movement calculation
  handleMovement(deltaTime: number): void {
    handleMovementUtil(this, deltaTime);
  }

  // Delegate animation updates
  updateAnimations(deltaTime: number): void {
    updateAnimationsUtil(this, deltaTime);
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
    // AI attack initiation is handled in aiController -> combatSystem
    if (!this.isPerformingAction) {
      this.handleMovement(deltaTime); // Sets this.velocity based on AI state
    } else {
      // Freeze movement during attack animation
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // Apply velocity to position and handle ground clamping
    applyMovement(this, deltaTime);

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
      switchAction(this, this.dieAction);
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
      switchAction(this, this.idleAction);
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
