// File: /src/core/Character.ts
// src/core/Character.ts
import {
  Vector3,
  Group,
  AnimationClip,
  AnimationMixer,
  AnimationAction,
  LoopOnce,
  Box3,
  Raycaster,
  Object3D,
  Scene,
} from "three";
import { Entity } from "./Entity";
import { Inventory } from "./Inventory";
import { EventLog } from "./EventLog";
import { AIController } from "./AIController";
import type { MoveState, UpdateOptions, InteractionResult } from "../types";
import {
  CHARACTER_HEIGHT,
  CHARACTER_RADIUS,
  PLAYER_ATTACK_DAMAGE,
  NPC_ATTACK_DAMAGE,
  ATTACK_RANGE,
  HEAL_AMOUNT,
  RESPAWN_HEALTH_FACTOR,
} from "../config";
import type { Game } from "../Game"; // Use type import
import { getTerrainHeight } from "../utils"; // Import utility function

export class Character extends Entity {
  // Stats & Movement
  maxStamina: number;
  stamina: number;
  walkSpeed: number;
  runSpeed: number;
  staminaDrainRate: number; // Per second
  staminaRegenRate: number; // Per second
  isSprinting: boolean;
  isExhausted: boolean;
  exhaustionThreshold: number; // Stamina level below which exhaustion occurs/recovers
  moveState: MoveState;

  // Inventory & Logging
  inventory: Inventory | null;
  eventLog: EventLog;

  // Animation
  mixer: AnimationMixer;
  animations: Record<string, AnimationAction | undefined> = {};
  currentActionName: string = "idle";

  // Actions & State
  isGathering: boolean = false;
  gatherAttackTimer: number = 0; // Timer for attack animation during gathering
  gatherAttackInterval: number = 1.0; // How often to play attack anim while gathering
  isPerformingAction: boolean = false; // Is playing a non-looping action anim (attack/heal)
  actionType: string = "none"; // 'attack', 'heal', 'gather'

  // AI & Interaction
  searchRadius: number = 30; // For AI observation
  roamRadius: number = 10; // For AI roaming
  persona: string = ""; // AI personality description
  aiController: AIController | null = null;

  // Internal helpers
  private groundCheckOrigin = new Vector3();
  private groundCheckDirection = new Vector3(0, -1, 0);
  private attackTriggered: boolean = false; // Prevent holding attack key spamming triggers
  private rayCaster: Raycaster; // Used for ground check and attack raycast

  constructor(
    scene: Scene,
    position: Vector3,
    name: string,
    model: Group, // The visual model (GLTF scene)
    animations: AnimationClip[],
    inventory: Inventory | null // Can be null if character doesn't have one
  ) {
    super(scene, position, name); // Call Entity constructor

    // Override/set Character-specific userData defaults
    // this.userData.isCollidable = true; // Collision removed
    this.userData.isInteractable = true; // Characters are usually interactable
    this.userData.interactionType = "talk"; // Default interaction
    this.userData.isNPC = true; // Default to NPC, override for player
    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;

    // Initialize Stats
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
      sprint: false,
      interact: false,
      attack: false,
    };

    // Assign Inventory & Event Log
    this.inventory = inventory;
    this.eventLog = new EventLog(); // Each character gets their own log

    // Setup Raycaster
    this.rayCaster = new Raycaster();

    // --- Model Setup ---
    // Calculate scale based on desired height and model's bounding box
    const box = new Box3().setFromObject(model);
    const modelHeight = box.max.y - box.min.y;
    const scale = modelHeight > 0 ? CHARACTER_HEIGHT / modelHeight : 1;
    model.scale.set(scale, scale, scale);
    // Adjust model position so its bottom aligns with the entity's origin (0,0,0)
    model.position.y = -box.min.y * scale;
    this.mesh!.add(model); // Add the scaled model to the entity's Group

    // --- Animation Setup ---
    this.mixer = new AnimationMixer(model); // Use the added model for animation
    this.setupAnimations(animations);
    this.switchAction("idle"); // Start with idle animation

    // Listen for animation finish events (e.g., for attack)
    this.mixer.addEventListener(
      "finished",
      (
        e: any // Use any type for event data
      ) => this.onAnimationFinished(e.action as AnimationAction)
    );

    // --- AI Setup (Default for NPCs) ---
    if (this.userData.isNPC) {
      this.aiController = new AIController(this);
    }

    // Final bounding box update after model setup
    this.updateBoundingBox();
    // Ensure initial position is on terrain
    if (this.mesh) {
      this.mesh.position.y = this.getTerrainHeightAtPosition();
      this.updateBoundingBox();
    }
  }

  // Sets up animation actions from loaded clips.
  setupAnimations(clips: AnimationClip[]): void {
    // Map desired action names to potential clip names (case-insensitive search)
    const animMap: Record<string, string[]> = {
      idle: ["idle", "idle_anim", "characteridle"],
      walk: ["walk", "walking", "walk_forward", "characterwalk"],
      run: ["run", "running", "run_forward", "characterrun"],
      attack: ["attack", "swing", "characterattack", "attack_1h"], // Add variations
      gather: ["gather", "mining", "pickup"], // Use specific or fallback to attack
      heal: ["heal", "cast_heal"], // Use specific or fallback to attack/idle
      death: ["death", "die", "characterdeath"],
    };

    for (const actionName in animMap) {
      let foundClip: AnimationClip | undefined = undefined;
      for (const clipNamePattern of animMap[actionName]) {
        foundClip = clips.find((c) =>
          c.name.toLowerCase().includes(clipNamePattern.toLowerCase())
        );
        if (foundClip) break; // Stop searching once found
      }

      if (foundClip) {
        const action = this.mixer.clipAction(foundClip);
        // Configure non-looping animations
        if (["attack", "heal", "gather", "death"].includes(actionName)) {
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true; // Stay on the last frame
        }
        this.animations[actionName] = action;
      } else {
        // Fallback logic: Use 'attack' for 'gather'/'heal' if specific anims not found
        if (
          (actionName === "gather" || actionName === "heal") &&
          this.animations.attack
        ) {
          this.animations[actionName] = this.animations.attack;
          console.warn(
            `Animation clip not found for: ${actionName}. Using 'attack' animation as fallback.`
          );
        } else {
          console.warn(
            `Animation clip not found for: ${actionName}. Action might not work correctly.`
          );
        }
      }
    }
    // Ensure idle exists, otherwise log critical error
    if (!this.animations.idle) {
      console.error(
        `CRITICAL: Idle animation not found for ${this.name}. Character may not animate correctly.`
      );
    }
  }

  // Switches the currently playing animation smoothly.
  switchAction(actionName: string): void {
    // Use fallback if the specific action doesn't exist but a fallback is defined (e.g., attack for gather)
    const targetActionName = this.animations[actionName]
      ? actionName
      : (actionName === "gather" || actionName === "heal") &&
          this.animations.attack
        ? "attack"
        : "idle"; // Default to idle if absolutely nothing found

    const newAction = this.animations[targetActionName];
    const oldAction = this.animations[this.currentActionName];

    // Don't interrupt if it's the same action already playing (unless it's a non-looping one we want to restart)
    if (
      newAction === oldAction &&
      newAction?.isRunning() &&
      newAction.loop !== LoopOnce
    ) {
      return;
    }

    // Reset and fade in the new action
    if (newAction) {
      newAction.reset(); // Reset before playing
      if (oldAction && oldAction !== newAction) {
        newAction.crossFadeFrom(oldAction, 0.2, true); // Fade from old action
      } else {
        newAction.fadeIn(0.2); // Simple fade in if no old action or same action restarting
      }
      newAction.play();
      this.currentActionName = targetActionName; // Update the current action name
    } else if (oldAction) {
      // If no new action exists, just fade out the old one (should ideally not happen with idle fallback)
      oldAction.fadeOut(0.2);
      this.currentActionName = "idle"; // Fallback state name
    }
  }

  // Called when a non-looping animation finishes.
  onAnimationFinished(action: AnimationAction): void {
    // Check if the finished action is one of the non-looping ones we care about
    const finishedActionName = Object.keys(this.animations).find(
      (name) => this.animations[name] === action
    );

    if (
      finishedActionName &&
      ["attack", "heal", "gather"].includes(finishedActionName)
    ) {
      this.isPerformingAction = false; // Allow new actions

      // Special handling for gather: if still gathering, loop back to idle/gather anim
      if (
        finishedActionName === "gather" ||
        (finishedActionName === "attack" && this.isGathering)
      ) {
        if (this.isGathering) {
          // Don't immediately switch if still gathering, update loop handles it
          return;
        }
      }

      // Reset action type if it was a one-off action like attack or heal
      if (finishedActionName === "attack" || finishedActionName === "heal") {
        this.actionType = "none";
      }

      // Transition back to idle or movement state
      const isMoving =
        Math.abs(this.moveState.forward) > 0.1 ||
        Math.abs(this.moveState.right) > 0.1;
      const nextState = true // Assume always on ground since no physics
        ? isMoving
          ? this.isSprinting
            ? "run"
            : "walk"
          : "idle"
        : "idle"; // Could add a 'fall' animation here if available
      this.switchAction(nextState);
    }
    // Handle 'death' animation finish if needed (e.g., trigger despawn timer)
  }

  // Performs an attack action, raycasting for targets.
  performAttack(): void {
    if (!this.mesh || !this.scene || !this.game) return;

    const damage = this.userData.isPlayer
      ? PLAYER_ATTACK_DAMAGE
      : NPC_ATTACK_DAMAGE;

    // Raycast origin slightly in front and center of the character
    const rayOriginOffset = new Vector3(
      0,
      CHARACTER_HEIGHT / 2,
      CHARACTER_RADIUS
    );
    const rayOrigin = this.mesh.localToWorld(rayOriginOffset.clone());
    const rayDirection = this.mesh.getWorldDirection(new Vector3());

    this.rayCaster.set(rayOrigin, rayDirection);
    this.rayCaster.far = ATTACK_RANGE;
    this.rayCaster.near = 0;

    // Find potential targets (other living characters)
    const potentialTargets = this.game.entities.filter(
      (
        entity
      ): entity is Character => // Type guard
        entity instanceof Character &&
        entity !== this && // Not self
        !entity.isDead && // Not dead
        entity.mesh !== null // Has a mesh
    );
    const targetMeshes = potentialTargets.map((char) => char.mesh!); // Get meshes

    const intersects = this.rayCaster.intersectObjects(targetMeshes, true); // Check recursively

    if (intersects.length > 0) {
      // Find the Character instance associated with the first hit mesh part
      let hitObject = intersects[0].object;
      let targetEntity: Character | null = null;
      while (hitObject && !targetEntity) {
        if (hitObject.userData?.entityReference instanceof Character) {
          targetEntity = hitObject.userData.entityReference;
        }
        hitObject = hitObject.parent!; // Traverse up the hierarchy
      }

      // Apply damage if a valid target character was found
      if (targetEntity && targetEntity !== this && !targetEntity.isDead) {
        targetEntity.takeDamage(damage, this); // Pass attacker reference
        // Spawn hit effect at the intersection point
        this.game.spawnParticleEffect(intersects[0].point, "red");
        // Log the attack hit
        this.game.logEvent(
          this,
          "attack_hit",
          `${this.name} hit ${targetEntity.name} for ${damage} damage.`,
          targetEntity,
          { damage },
          intersects[0].point
        );
      }
    } else {
      // Log the attack miss (optional)
      // this.game.logEvent(this, 'attack_miss', `${this.name} attacked but missed.`, undefined, {}, rayOrigin.addScaledVector(rayDirection, ATTACK_RANGE / 2));
    }
  }

  // Heals the character itself.
  selfHeal(): void {
    if (
      this.isDead ||
      this.isPerformingAction ||
      this.health >= this.maxHealth
    ) {
      if (this.health >= this.maxHealth && this.game && this.mesh) {
        this.game.logEvent(
          this,
          "heal_fail",
          `${this.name} is already at full health.`,
          undefined,
          {},
          this.mesh.position
        );
      }
      return;
    }

    const actualHeal = Math.min(HEAL_AMOUNT, this.maxHealth - this.health);

    if (actualHeal > 0) {
      this.heal(actualHeal); // Apply heal (base Entity method)

      // Log the heal event
      if (this.game && this.mesh) {
        this.game.logEvent(
          this,
          "self_heal",
          `${this.name} healed for ${actualHeal} health.`,
          undefined, // Target is self, implied
          { amount: actualHeal },
          this.mesh.position
        );
        // Spawn heal particle effect
        this.game.spawnParticleEffect(
          this.mesh.position
            .clone()
            .add(new Vector3(0, CHARACTER_HEIGHT / 2, 0)),
          "green"
        );
      }
      // Trigger the heal animation (might use 'attack' or a specific 'heal' anim)
      this.triggerAction("heal");
    }
  }

  // Manages stamina consumption and regeneration.
  handleStamina(deltaTime: number): void {
    const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;

    // Determine if sprinting based on input, movement, stamina, and exhaustion
    this.isSprinting =
      this.moveState.sprint &&
      isMoving &&
      !this.isExhausted &&
      this.stamina > 0;

    if (this.isSprinting) {
      // Drain stamina while sprinting
      this.stamina -= this.staminaDrainRate * deltaTime;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.isExhausted = true;
        this.isSprinting = false; // Stop sprinting when exhausted
        if (this.game && this.mesh) {
          this.game.logEvent(
            this,
            "exhausted",
            `${this.name} is exhausted!`,
            undefined,
            {},
            this.mesh.position
          );
        }
      }
    } else {
      // Regenerate stamina if not sprinting
      let currentRegenRate = this.staminaRegenRate;
      if (this.isExhausted) {
        currentRegenRate /= 2; // Slower regeneration while exhausted
        // Check if recovered from exhaustion
        if (this.stamina >= this.exhaustionThreshold) {
          this.isExhausted = false;
          if (this.game && this.mesh) {
            this.game.logEvent(
              this,
              "recovered",
              `${this.name} feels recovered.`,
              undefined,
              {},
              this.mesh.position
            );
          }
        }
      }
      // Apply regeneration, clamping at max stamina
      this.stamina = Math.min(
        this.maxStamina,
        this.stamina + currentRegenRate * deltaTime
      );
    }
  }

  // Calculates intended movement velocity based on input state.
  handleMovement(deltaTime: number): void {
    if (!this.mesh) return;

    // Get forward and right vectors based on current mesh orientation
    const forward = new Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);

    // Normalize the input direction vector
    const moveDirection = new Vector3(
      this.moveState.right,
      0,
      this.moveState.forward
    );
    const isMoving = moveDirection.lengthSq() > 0.01; // Check if there's significant input

    const moveVelocity = new Vector3(); // Intended horizontal velocity

    if (isMoving) {
      moveDirection.normalize();
      // Combine forward/backward and strafe movements
      moveVelocity.addScaledVector(forward, moveDirection.z);
      moveVelocity.addScaledVector(right, moveDirection.x);

      // Determine current speed based on sprinting state
      const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
      moveVelocity.normalize().multiplyScalar(currentSpeed); // Ensure consistent speed regardless of diagonal movement
    }

    // Apply calculated horizontal velocity directly to position
    this.mesh.position.addScaledVector(moveVelocity, deltaTime);

    // Snap to terrain height after horizontal movement
    this.mesh.position.y = this.getTerrainHeightAtPosition();
  }

  // Updates the character's animations based on state.
  updateAnimations(deltaTime: number): void {
    this.mixer.update(deltaTime);

    // Don't change animation if performing a blocking action (attack/heal)
    // or if the death animation is playing
    if (this.isPerformingAction || this.animations.death?.isRunning()) {
      return;
    }

    // Handle gathering animation loop (uses 'gather' or 'attack' animation)
    const gatherAnim = this.animations.gather || this.animations.attack;
    if (this.isGathering && gatherAnim) {
      this.gatherAttackTimer += deltaTime;
      if (this.gatherAttackTimer >= this.gatherAttackInterval) {
        gatherAnim.reset().play(); // Play gather/attack anim periodically
        this.gatherAttackTimer = 0;
        this.currentActionName = this.animations.gather ? "gather" : "attack"; // Reflect the playing anim
      }
      // Ensure idle/walk isn't playing over gather attack if the gather anim just finished
      else if (!gatherAnim.isRunning() && this.currentActionName !== "idle") {
        this.switchAction("idle"); // Default to idle between gather swings
      }
      return; // Don't override with movement anims while gathering
    }

    // Determine animation based on movement state
    let targetAnimation: string;
    // On ground
    const isMoving =
      Math.abs(this.moveState.forward) > 0.1 ||
      Math.abs(this.moveState.right) > 0.1;
    if (isMoving) {
      targetAnimation = this.isSprinting ? "run" : "walk";
    } else {
      targetAnimation = "idle";
    }

    // Switch to the target animation if not already playing
    if (this.currentActionName !== targetAnimation) {
      this.switchAction(targetAnimation);
    }
  }

  // Triggers a specific action animation (attack, heal, gather).
  triggerAction(actionType: "attack" | "heal" | "gather" | string): void {
    // Find the appropriate animation, potentially using fallbacks
    let actionAnim = this.animations[actionType];
    if (!actionAnim && (actionType === "heal" || actionType === "gather")) {
      actionAnim = this.animations.attack; // Fallback to attack animation
    }

    if (!actionAnim) {
      console.warn(
        `Cannot trigger action: Animation for "${actionType}" not found.`
      );
      return;
    }

    // Handle different action types
    if (actionType === "attack" || actionType === "heal") {
      // One-shot actions
      if (!this.isPerformingAction && !this.isGathering) {
        this.actionType = actionType;
        this.isPerformingAction = true; // Block other actions until finished
        this.switchAction(actionType); // Play the animation

        // Attack logic (damage dealing) happens after animation finishes (in onAnimationFinished)
        // Heal logic is applied immediately in selfHeal before calling triggerAction
      }
    } else if (actionType === "gather") {
      // Start gathering state (looping animation handled in updateAnimations)
      if (!this.isGathering && !this.isPerformingAction) {
        this.actionType = actionType;
        this.isGathering = true;
        this.gatherAttackTimer = this.gatherAttackInterval; // Trigger first anim immediately in updateAnimations
        // Initial animation switch might happen here or in updateAnimations
        this.switchAction(this.animations.gather ? "gather" : "attack");
      }
    }
  }

  // Add this method to get terrain height at the player's position
  // Add this method to get terrain height at the player's position
  getTerrainHeightAtPosition(): number {
    if (!this.game) return 0;
    return getTerrainHeight(
      this.game.scene,
      this.mesh?.position.x!,
      this.mesh?.position.z!
    );
  }

  // Modify the update method to determine ground state before movement
  override update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead || !this.mesh) return;

    const { moveState } = options;

    // Use provided moveState (from Controls or AI) or internal state if none provided
    this.moveState = moveState ?? this.moveState;
    // const effectiveCollidables =
    //   collidables ?? this.game?.collidableObjects ?? []; // Collision removed

    // Update AI Controller if this is an NPC
    if (this.aiController && !this.userData.isPlayer) {
      this.moveState = this.aiController.computeAIMoveState(deltaTime);
    }

    // --- State Updates ---
    this.handleStamina(deltaTime);

    // --- Movement Calculation & Application ---
    if (!this.isPerformingAction) {
      this.handleMovement(deltaTime); // Now applies movement directly and snaps to terrain
    } else {
      // Optionally snap to terrain even if performing action?
      this.mesh.position.y = this.getTerrainHeightAtPosition();
    }

    // --- Physics & Collision ---
    // Removed - Physics system is gone, movement handled above

    // --- Action Triggers ---
    if (
      this.moveState.attack &&
      !this.attackTriggered &&
      !this.isPerformingAction &&
      !this.isGathering
    ) {
      this.attackTriggered = true;
      this.triggerAction("attack");
    } else if (!this.moveState.attack) {
      this.attackTriggered = false;
    }

    // --- Animation & Bounding Box ---
    this.updateAnimations(deltaTime);
    this.updateBoundingBox(); // Still useful for interaction, minimap, etc.

    // Update AI intent display
    if (this.aiController && this.intentSprite) {
      this.setPersistentIntent(this.aiController.currentIntent);
    }
  }

  // Overrides the base Entity die method.
  override die(attacker: Entity | null = null): void {
    if (this.isDead) return;

    super.die(attacker); // Call base Entity die method (sets flags, health=0)

    // Character-specific death logic
    if (this.aiController) this.aiController.aiState = "dead"; // Set AI state
    this.isGathering = false;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.mixer.stopAllAction(); // Stop all animations

    // Play death animation if available
    if (this.animations.death) {
      this.switchAction("death");
    } else {
      // Fallback if no death animation (e.g., ragdoll or just stop)
    }

    // Log the death event
    if (this.game && this.mesh) {
      this.game.logEvent(
        this,
        "death",
        `${this.name} has died${attacker ? ` (killed by ${attacker.name})` : ""}!`,
        attacker?.name, // Target is the attacker
        attacker ? { killedBy: attacker.name } : {},
        this.mesh.position
      );
      // Log kill event for the attacker if applicable
      if (attacker instanceof Character && attacker.game && attacker.mesh) {
        attacker.game.logEvent(
          attacker,
          "defeat",
          `${attacker.name} defeated ${this.name}.`,
          this, // Target is the defeated character
          {},
          attacker.mesh.position
        );
      }
    }
  }

  // Respawns the character at a given position.
  respawn(position: Vector3): void {
    if (!this.isDead) return; // Can only respawn if dead

    this.setPosition(position); // Set new position (includes terrain snap)
    this.health = this.maxHealth * RESPAWN_HEALTH_FACTOR; // Respawn with partial health
    this.stamina = this.maxStamina;
    this.velocity.set(0, 0, 0); // Reset velocity (though not used for movement directly now)
    this.isDead = false;
    this.isExhausted = false;
    this.isGathering = false;
    this.gatherAttackTimer = 0;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;
    // this.userData.isCollidable = true; // Collision removed
    this.userData.isInteractable = true;

    // Reset AI state if applicable
    if (this.aiController) {
      this.aiController.resetActionState(); // Reset AI state fully
      this.aiController.homePosition = position.clone(); // Update home position
    }

    // Reset animations
    this.mixer.stopAllAction();
    this.switchAction("idle"); // Start idle animation

    // Log respawn event
    if (this.game) {
      this.game.logEvent(
        this,
        "respawn",
        `${this.name} respawned.`,
        undefined,
        {},
        position
      );
    }
    this.updateBoundingBox(); // Update BB at new location
  }

  // Handles interaction when the player interacts with this character.
  interact(player: Character): InteractionResult | null {
    if (this.isDead) {
      return { type: "message", message: "Cannot interact with the deceased." };
    }

    // NPC looks at the player
    this.lookAt(player.mesh!.position);

    // Log interaction start
    this.game?.logEvent(
      player, // Actor is the player initiating interaction
      "interact_start",
      `Started interacting with ${this.name}.`,
      this, // Target is this character
      {},
      player.mesh!.position
    );

    // Default interaction for NPCs is to open chat
    return { type: "chat" };
  }
}
