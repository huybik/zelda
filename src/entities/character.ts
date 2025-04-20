/* File: /src/entities/character.ts */
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
  SkeletonHelper,
  Bone,
  SkinnedMesh,
  Object3D,
  Raycaster,
  Sprite,
  Quaternion,
  MathUtils, // Added Quaternion
  CanvasTexture,
  SpriteMaterial,
  AxesHelper,
} from "three";
import {
  EventLog,
  Inventory,
  UpdateOptions,
  MoveState,
  getTerrainHeight,
  InteractionResult,
  InventoryItem, // Added InventoryItem
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
  findBone, // Added findBone
} from "../core/animations";

import {
  ItemDefinition,
  WeaponDefinition,
  ConsumableDefinition,
  EquipSlot,
  ItemType, // Added ItemType
  getItemDefinition,
  isWeapon,
  isConsumable,
  EquippedItem, // Added item types
  Profession, // Added Profession enum
  ProfessionStartingWeapon,
} from "../core/items";
import { loadModels } from "../core/assetLoader"; // Added weapon loader
import { Animal } from "./animals";
import {
  switchAction as switchActionUtil,
  transitionToLocomotion as transitionToLocomotionUtil,
  playAttackAnimation as playAttackAnimationUtil,
  updateAnimations as updateAnimationsUtil,
} from "../components/animationUtils";
import {
  handleStamina as handleStaminaUtil,
  handleMovement as handleMovementUtil,
  applyMovement,
} from "../components/movementUtils";
import {
  equipWeapon as equipWeaponUtil,
  unequipWeapon as unequipWeaponUtil,
  updateWeaponOrientation as updateWeaponOrientationUtil,
} from "../components/equipmentUtils";

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
  attackTriggered: boolean = false;
  inventory: Inventory | null;
  persona: string = "";
  professions: Set<Profession> = new Set(); // Store multiple professions
  profession: Profession = Profession.None; // Keep primary for compatibility/display?
  currentAction?: AnimationAction;
  actionType: string = "none"; // "attack", "chat", "none"
  // isPerformingAction: boolean = false; // Inherited from Entity
  skeletonRoot: Object3D | null = null;
  aiController: AIController | null;
  respawnDelay: number = 40000; // 60 seconds respawn delay for NPCs
  // lastAttacker: Entity | null = null; // Inherited from Entity
  bonusDamage: number = 0; // Flat bonus damage from upgrades
  // attackCooldown: number = 0.8; // Inherited from Entity
  // lastAttackTime: number = -1; // Inherited from Entity

  // Item/Equipment related properties
  rightHandBone: Bone | null = null;
  equippedWeapon: EquippedItem | null = null; // Stores definition and model instance

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
    this.userData.isNPC = true; // Default to NPC, override for player
    this.homePosition = position.clone(); // Store initial position for respawn
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
    this.rayCaster = new Raycaster();
    this.aiController = new AIController(this); // Assume NPC by default

    // --- Model Setup ---
    let skinnedMesh: SkinnedMesh | null = null;
    model.traverse((child) => {
      if (child instanceof SkinnedMesh) {
        skinnedMesh = child;
      }
      // Find skeleton root more reliably
      if (child instanceof Bone && !this.skeletonRoot) {
        let current: Object3D = child;
        while (
          current.parent &&
          !(current.parent instanceof Scene) &&
          !(current.parent === model)
        ) {
          // Check if parent is a Bone or a generic Object3D (common in rigs)
          if (
            current.parent instanceof Bone ||
            current.parent.type === "Object3D"
          ) {
            current = current.parent;
          } else {
            break; // Stop if parent is not a typical rig node
          }
        }
        // Only assign if we actually moved up the hierarchy
        if (current !== child) {
          this.skeletonRoot = current;
        }
      }
    });
    // Fallback if no bone hierarchy found
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
      (currentHeight > 0.1 ? currentHeight : CHARACTER_HEIGHT);
    model.scale.set(scale, scale, scale);
    // Adjust position based on scaled bounding box minimum y
    model.position.y = -box.min.y * scale;
    this.mesh!.add(model);

    // Enable shadow casting
    model.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = false; // Characters usually don't receive shadows on themselves
      }
    });

    // --- Find Bones ---
    // Find the right hand bone after model is added and potentially scaled
    if (this.skeletonRoot) {
      // Try specific hand names first, then fallback to arm
      this.rightHandBone = findBone(this.skeletonRoot, "RightHand");
      if (!this.rightHandBone) {
        console.warn(
          `RightHand/Arm bone not found for ${this.name}. Weapon attachment might fail.`
        );
      } else {
        console.log(
          `Found right hand bone for ${this.name}: ${this.rightHandBone.name}`
        );
      }
    }

    // --- Animation Setup ---
    this.mixer = new AnimationMixer(model); // Use the main model group for the mixer
    const getOrCreateAnimation = (
      nameIdentifier: string,
      generator: ((root: Object3D) => AnimationClip) | null
    ): AnimationClip | null => {
      const foundAnim = animations.find((anim) =>
        anim.name.toLowerCase().includes(nameIdentifier)
      );
      if (foundAnim) {
        // console.log(`Using existing "${nameIdentifier}" animation for ${this.name}.`);
        return foundAnim;
      } else if (generator && this.skeletonRoot) {
        console.log(
          `Generating fallback "${nameIdentifier}" animation for ${this.name}.`
        );
        try {
          const generatedAnim = generator(this.skeletonRoot);
          return generatedAnim;
        } catch (e) {
          console.error(
            `Failed to generate ${nameIdentifier} animation for ${this.name}`,
            e
          );
          return null;
        }
      }
      console.warn(
        `Could not find or generate "${nameIdentifier}" animation for ${this.name}.`
      );
      return null;
    };

    // Try common variations for animation names
    const idleAnim =
      getOrCreateAnimation("idle", createIdleAnimation) ||
      getOrCreateAnimation("idle_anim", createIdleAnimation);
    const walkAnim =
      getOrCreateAnimation("walk", createWalkAnimation) ||
      getOrCreateAnimation("walking", createWalkAnimation);
    const runAnim =
      getOrCreateAnimation("run", createRunAnimation) ||
      getOrCreateAnimation("running", createRunAnimation);
    const attackAnim =
      getOrCreateAnimation("attack", createAttackAnimation) ||
      getOrCreateAnimation("swing", createAttackAnimation);
    const deadAnim =
      getOrCreateAnimation("dead", createDeadAnimation) ||
      getOrCreateAnimation("death", createDeadAnimation);

    if (idleAnim) this.idleAction = this.mixer.clipAction(idleAnim);
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
      this.attackCooldown = this.attackAction.getClip().duration * 0.9; // Set cooldown based on animation
    }
    if (deadAnim) {
      this.deadAction = this.mixer.clipAction(deadAnim);
      this.deadAction.setLoop(LoopOnce, 1);
      this.deadAction.clampWhenFinished = true;
    }

    if (this.idleAction) {
      switchActionUtil(this, this.idleAction);
    } else {
      console.error(`Character ${this.name} has no idle animation!`);
    }

    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;
    this.updateBoundingBox();

    // Animation finished listener
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.attackAction) {
        this.isPerformingAction = false;
        this.actionType = "none";
        // Transition back to locomotion immediately after attack finishes
        transitionToLocomotionUtil(this, this.moveState);
      }
      // Death animation clamps, no transition needed
    });
  }

  // --- Item Interaction Methods ---

  /**
   * Handles the action (use/equip) for an item in the inventory.
   * Called by InventoryDisplay on double-click/tap.
   */

  initIntentDisplay(): void {
    // Only init for NPCs with AIController, not animals
    if (!(this.aiController instanceof AIController) || !this.mesh) return;

    const isMobile = this.game?.mobileControls?.isActive() ?? false;
    const baseScale = isMobile ? 3 : 0.6; // Larger base scale for mobile

    // Initialize rayCaster here if not already done (e.g., by Character)
    if (!this.rayCaster) {
      this.rayCaster = new Raycaster();
    }
    if (this.game?.camera) {
      this.rayCaster.camera = this.game.camera;
    }
    if (!this.intentCanvas) {
      this.intentCanvas = document.createElement("canvas");
      this.intentCanvas.width = 200;
      this.intentCanvas.height = 75;
      this.intentContext = this.intentCanvas.getContext("2d")!;
      this.intentTexture = new CanvasTexture(this.intentCanvas);
    }
    if (!this.intentSprite) {
      const material = new SpriteMaterial({ map: this.intentTexture });
      this.intentSprite = new Sprite(material);
      const aspectRatio = this.intentCanvas.width / this.intentCanvas.height;
      this.intentSprite.scale.set(aspectRatio * baseScale, baseScale, 1); // Apply base scale

      const baseHeight = isMobile ? 2 : 0.6;
      this.intentSprite.position.set(0, CHARACTER_HEIGHT + baseHeight, 0);
      this.mesh!.add(this.intentSprite);
    } else {
      // Update scale if mobile status changed
      const aspectRatio = this.intentCanvas.width / this.intentCanvas.height;
      this.intentSprite.scale.set(aspectRatio * baseScale, baseScale, 1);
    }
    this.updateIntentDisplay("");
  }

  updateIntentDisplay(text: string): void {
    // Only update for NPCs with AIController
    if (!(this.aiController instanceof AIController)) {
      if (this.intentSprite) this.intentSprite.visible = false;
      return;
    }
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
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }
    this.intentTexture.needsUpdate = true;
  }

  handleItemAction(inventoryIndex: number): void {
    if (!this.inventory || this.isDead) return;

    const inventoryItem = this.inventory.getItem(inventoryIndex);
    if (!inventoryItem) return;

    const definition = getItemDefinition(inventoryItem.id);
    if (!definition) {
      console.warn(`No definition found for item ID: ${inventoryItem.id}`);
      return;
    }

    if (isWeapon(definition)) {
      if (this.equippedWeapon?.definition.id === definition.id) {
        // Currently equipped: Unequip it
        this.unequipWeapon();
      } else {
        // Not currently equipped (or different weapon equipped): Equip it
        this.equipWeapon(definition);
      }
      // Close inventory after equipping

      this.game?.inventoryDisplay?.hide();
      this.game?.setPauseState(false); // Ensure game unpauses
    } else if (isConsumable(definition)) {
      this.useConsumable(definition, inventoryIndex);
    } else {
      // Handle other item types if needed (e.g., placeables)
      console.log(
        `Item type '${definition.type}' cannot be used/equipped directly.`
      );
      if (this.game) {
        this.game.logEvent(
          this,
          "action_fail",
          `Cannot use ${definition.name} directly.`,
          undefined,
          { item: definition.name },
          this.mesh!.position
        );
      }
    }
  }

  /** Delegates equipping a weapon to the utility function. */
  equipWeapon(definition: WeaponDefinition): void {
    equipWeaponUtil(this, definition);
  }

  /** Delegates unequipping a weapon to the utility function. */
  unequipWeapon(): void {
    unequipWeaponUtil(this);
  }

  /**
   * Uses a consumable item from the inventory.
   * @param definition The definition of the consumable.
   * @param inventoryIndex The inventory slot index from which the item is being used.
   */
  useConsumable(
    definition: ConsumableDefinition,
    inventoryIndex: number
  ): void {
    if (this.isDead || !this.inventory) return;

    let used = false;
    let effectMessage = "";

    // Apply healing effect
    if (definition.healAmount && this.health < this.maxHealth) {
      const heal = definition.healAmount;
      const actualHeal = Math.min(heal, this.maxHealth - this.health); // Heal only up to max health
      this.health += actualHeal;
      effectMessage += `Healed ${actualHeal.toFixed(0)} HP. `;
      used = true;
    }

    // Add other consumable effects here (e.g., stamina restore, buffs)
    // if (definition.staminaAmount && this.stamina < this.maxStamina) { ... }

    if (used) {
      console.log(`${this.name} used ${definition.name}. ${effectMessage}`);
      if (this.game) {
        this.game.logEvent(
          this,
          "use_item",
          `Used ${definition.name}. ${effectMessage}`,
          undefined,
          { item: definition.name },
          this.mesh!.position
        );
      }
      // Remove one item from the specific inventory slot
      this.inventory.removeItemByIndex(inventoryIndex, 1);
      // Show item removed notification
      this.game?.notificationManager?.createItemRemovedSprite(
        definition.id,
        1, // Always 1 for consumables currently
        this.mesh!.position.clone().add(new Vector3(0, 1, 0))
      );
    } else {
      // Log if the item had no usable effect (e.g., already at full health)
      console.log(
        `${this.name} tried to use ${definition.name}, but no effect needed.`
      );
      if (this.game) {
        this.game.logEvent(
          this,
          "use_item_fail",
          `Could not use ${definition.name} (no effect needed).`,
          undefined,
          { item: definition.name },
          this.mesh!.position
        );
      }
    }
  }

  // --- Core Update Logic ---

  /** Delegates playing the attack animation to the utility function. */
  playAttackAnimation(): void {
    playAttackAnimationUtil(this);
  }

  getAttackDamage(): number {
    // Base damage from weapon or fists
    const baseDamage = this.equippedWeapon
      ? this.equippedWeapon.definition.damage
      : 2; // Base fist damage

    // Profession bonus (example: +50% if using preferred weapon)
    let professionMultiplier = 1.0;
    if (this.equippedWeapon) {
      const weaponDef = this.equippedWeapon.definition;
      let efficientProfession: Profession | null = null;
      if (weaponDef.id === "sword") efficientProfession = Profession.Hunter;
      else if (weaponDef.id === "pickaxe")
        efficientProfession = Profession.Blacksmith;
      else if (weaponDef.id === "axe") efficientProfession = Profession.Farmer;

      if (efficientProfession && this.professions.has(efficientProfession)) {
        professionMultiplier = 1.5; // 50% bonus
      }
    }

    // Total damage calculation
    const totalDamage =
      Math.round(baseDamage * professionMultiplier) + this.bonusDamage;

    return Math.max(1, totalDamage); // Ensure at least 1 damage
  }

  getAttackRange(): number {
    // Return weapon range or default fist range
    // For now, let's use a fixed range, but could be weapon-dependent
    return this.equippedWeapon ? 3.0 : 2.0;
  }

  /** Delegates stamina handling to the utility function. */
  handleStamina(deltaTime: number): void {
    handleStaminaUtil(this, deltaTime);
  }

  /** Delegates movement calculation to the utility function. */
  handleMovement(deltaTime: number): void {
    handleMovementUtil(this, deltaTime);
  }

  /** Delegates animation updates to the utility function. */
  updateAnimations(deltaTime: number): void {
    updateAnimationsUtil(this, deltaTime);
  }

  /** Delegates weapon orientation updates to the utility function. */
  updateWeaponOrientation(): void {
    updateWeaponOrientationUtil(this);
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) {
      this.updateAnimations(deltaTime); // Keep updating mixer for death animation
      return;
    }

    const { moveState, collidables } = options;
    if (!moveState || !collidables) return; // Need moveState for player/NPC control

    // Update internal moveState based on input (player) or AI calculation (NPC)
    this.moveState = moveState;

    this.handleStamina(deltaTime);

    // Apply movement unless performing a non-interruptible action
    if (!this.isPerformingAction) {
      this.handleMovement(deltaTime);
    } else {
      // Freeze movement during attack animation
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // Apply velocity to position and handle ground clamping
    applyMovement(this, deltaTime);

    // Attack input is handled in main.ts -> combatSystem for player
    // AI attack initiation is handled in aiController -> combatSystem

    this.updateAnimations(deltaTime); // Mixer updates bone transforms here
    this.updateWeaponOrientation(); // Ensure weapon faces forward after animation update
    this.updateBoundingBox(); // Update box after position change
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;

    const deathPosition = this.mesh!.position.clone(); // Store position before super.die() potentially changes things
    this.lastAttacker = attacker; // Store the attacker

    // --- Drop Inventory ---
    if (this.inventory && this.game) {
      const equippedWeaponId = this.equippedWeapon?.definition.id;
      const itemsToDrop: { id: string; count: number }[] = [];
      const indicesToRemove: number[] = [];

      this.inventory.items.forEach((item, index) => {
        if (item && item.id !== equippedWeaponId) {
          itemsToDrop.push({ id: item.id, count: item.count });
          indicesToRemove.push(index);
        }
      });

      // Drop items into the world
      itemsToDrop.forEach((drop) => {
        this.game!.dropItem(drop.id, drop.count, deathPosition);
      });

      // Clear dropped items from inventory (iterate backwards to avoid index issues)
      indicesToRemove.sort((a, b) => b - a); // Sort descending
      indicesToRemove.forEach((index) => {
        this.inventory!.items[index] = null;
      });
      this.inventory.notifyChange(); // Update UI if open
    }

    // Unequip weapon visually (model is removed, but item remains in inventory if it wasn't dropped)
    this.unequipWeapon();

    super.die(attacker); // Sets this.isDead = true, stops velocity, etc.

    // AI specific state change
    if (this.aiController) this.aiController.aiState = "dead";

    // Reset action states
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;

    // Play death animation
    if (this.deadAction) {
      switchActionUtil(this, this.deadAction);
    } else {
      // Fallback if no death animation
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

  respawn(): void {
    if (!this.homePosition || !this.scene) {
      console.warn(
        `Cannot respawn ${this.name}: Missing home position or scene.`
      );
      return;
    }

    // Reset state
    this.health = this.maxHealth * 0.75;
    this.stamina = this.maxStamina;
    this.velocity.set(0, 0, 0);
    this.isDead = false;
    this.deathTimestamp = null;
    this.isExhausted = false;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;
    this.equippedWeapon = null; // Ensure weapon is unequipped on respawn
    this.lastAttacker = null; // Reset attacker on respawn

    // Reset position and collision state
    const respawnY = getTerrainHeight(
      this.scene,
      this.homePosition.x,
      this.homePosition.z
    );
    this.setPosition(this.homePosition.clone().setY(respawnY));
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;
    this.mesh!.visible = true; // Make sure mesh is visible

    // Reset AI state if it's an NPC respawning
    if (this.aiController) {
      this.aiController.homePosition.copy(this.homePosition); // Ensure AI home is updated
      this.aiController.aiState = "idle";
      this.aiController.previousAiState = "idle";
      this.aiController.destination = null;
      this.aiController.target = null;
      this.aiController.targetAction = null;
      this.aiController.message = null;
      this.aiController.persistentAction = null; // Clear persistent action
      this.aiController.currentIntent = "Recovering...";
      this.updateIntentDisplay(this.aiController.currentIntent);
      this.aiController.lastLoggedAttackTargetId = null; // Reset logged target on respawn
    }

    // Reset animations
    this.mixer.stopAllAction();
    if (this.idleAction) {
      switchActionUtil(this, this.idleAction);
    } else {
      console.error(`Character ${this.name} cannot respawn to idle animation!`);
    }

    // Re-equip starting weapon for NPCs
    const startingWeaponId = ProfessionStartingWeapon[this.profession];
    if (startingWeaponId && this.inventory) {
      // Check if they still have it (it shouldn't have been dropped)
      if (this.inventory.countItem(startingWeaponId) > 0) {
        const weaponDef = getItemDefinition(startingWeaponId);
        if (weaponDef && isWeapon(weaponDef)) {
          requestAnimationFrame(() => {
            this.equipWeapon(weaponDef);
          });
        }
      } else {
        // If they somehow lost it, give it back
        const addResult = this.inventory.addItem(startingWeaponId, 1);
        if (addResult.totalAdded > 0) {
          const weaponDef = getItemDefinition(startingWeaponId);
          if (weaponDef && isWeapon(weaponDef)) {
            requestAnimationFrame(() => {
              this.equipWeapon(weaponDef);
            });
          }
        }
      }
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
    if (this.aiController) this.initIntentDisplay(); // Re-initialize intent display for NPCs
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

  /** Adds a profession to the character's set of professions. */
  addProfession(profession: Profession): void {
    if (profession !== Profession.None) {
      this.professions.add(profession);
      console.log(`${this.name} gained profession: ${profession}`);
      // Optionally update primary profession if it was None
      if (this.profession === Profession.None) {
        this.profession = profession;
      }
      // Log the event
      this.game?.logEvent(
        this,
        "gain_profession",
        `${this.name} gained the ${profession} profession.`,
        undefined,
        { profession: profession },
        this.mesh?.position
      );
    }
  }

  /** Upgrades the character's bonus damage. */
  upgradeWeaponDamage(amount: number): void {
    this.bonusDamage += amount;
    console.log(
      `${this.name}'s bonus damage increased by ${amount} to ${this.bonusDamage}.`
    );
    this.game?.logEvent(
      this,
      "upgrade_damage",
      `${this.name}'s damage was upgraded by ${amount}.`,
      undefined,
      { amount: amount, totalBonus: this.bonusDamage },
      this.mesh?.position
    );
  }
}
