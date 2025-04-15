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
} from "../core/items";
import { loadModels } from "../core/assetLoader"; // Added weapon loader

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
  currentAction?: AnimationAction;
  actionType: string = "none"; // "attack", "chat", "none"
  isPerformingAction: boolean = false;
  skeletonRoot: Object3D | null = null;
  deathTimestamp: number | null = null;
  aiController: AIController | null;

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

    // Animation finished listener
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.attackAction) {
        const isPlayerHoldingAttack =
          this.userData.isPlayer && this.moveState.attack;
        if (isPlayerHoldingAttack) {
          // Player attack chaining
          this.performAttack(); // Perform next attack logic
          this.attackAction?.reset().play(); // Replay animation
        } else if (!this.userData.isPlayer && this.moveState.attack) {
          // NPC continuous attack: Allow next update loop to trigger
          this.isPerformingAction = false;
        } else {
          // Stop attacking
          this.isPerformingAction = false;
          this.actionType = "none";
          this.transitionToLocomotion();
        }
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
    if (!(this.aiController instanceof AIController)) return;

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
      this.intentSprite.scale.set(aspectRatio * 0.6, 0.6, 1);
      this.intentSprite.position.set(0, CHARACTER_HEIGHT + 0.6, 0);
      this.mesh!.add(this.intentSprite);
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
      // Check if already equipped
      if (this.equippedWeapon?.definition.id === definition.id) {
        this.unequipWeapon(); // Double-click equipped item to unequip
      } else {
        this.equipWeapon(definition);
      }
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

  /**
   * Equips a weapon or tool.
   * @param definition The definition of the weapon/tool to equip.
   */
  async equipWeapon(definition: WeaponDefinition): Promise<void> {
    if (this.isDead || !this.rightHandBone) {
      console.warn(
        `Cannot equip ${definition.name}: Character dead or no right hand bone.`
      );
      return;
    }

    this.unequipWeapon();

    try {
      const modelPaths = {
        [definition.name]: `assets/items/weapons/${definition.modelFileName}`,
      };
      let weaponModel = null;
      if (this.game && !this.game.models[definition.name]) {
        const models = await loadModels(modelPaths);
        this.game.models[definition.name] = models[definition.name];
        weaponModel = this.game.models[definition.name].scene.clone();
      } else if (this.game?.models[definition.name]) {
        weaponModel = this.game.models[definition.name].scene.clone();
      }

      if (!weaponModel) {
        throw new Error(`Failed to load weapon model for ${definition.name}`);
      }

      // Reset transformations
      weaponModel.position.set(0, 0, 0);
      weaponModel.rotation.set(0, 0, 0);
      weaponModel.scale.set(1, 1, 1);

      // Apply scale and position adjustments per weapon type
      if (definition.id === "sword") {
        weaponModel.scale.set(0.5, 0.5, 0.5);
        weaponModel.position.set(0, 0.2, 0); // Offset along hand bone's Y-axis
      } else if (definition.id === "axe") {
        weaponModel.scale.set(0.4, 0.4, 0.4);
        weaponModel.position.set(0, 0.25, 0);
      } else if (definition.id === "pickaxe") {
        weaponModel.scale.set(0.4, 0.4, 0.4);
        weaponModel.position.set(0, 0.25, 0);
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );

      // Attach to the right hand bone
      this.rightHandBone.add(weaponModel);

      // Align weapon's world orientation with character's forward direction
      const handBoneWorldQuaternion = new Quaternion();
      this.rightHandBone.getWorldQuaternion(handBoneWorldQuaternion);
      weaponModel.quaternion
        .copy(this.mesh!.quaternion) // Character's world rotation
        .premultiply(handBoneWorldQuaternion.invert()); // Adjust for hand bone's orientation

      // Optional: Apply additional local rotation if weapon model orientation needs adjustment
      // Example: If sword blade points along +Z instead of -Z, rotate Y by π
      // if (definition.id === "sword") {
      //   weaponModel.rotateY(Math.PI);
      // }

      // Store equipped weapon data
      this.equippedWeapon = {
        definition: definition,
        modelInstance: weaponModel,
        attachedBone: this.rightHandBone,
      };

      console.log(`${this.name} equipped ${definition.name}.`);
      if (this.game) {
        this.game.logEvent(
          this,
          "equip",
          `Equipped ${definition.name}.`,
          undefined,
          { item: definition.name },
          this.mesh!.position
        );
      }
    } catch (error) {
      console.error(
        `Failed to load and equip weapon ${definition.name}:`,
        error
      );
      if (this.game) {
        this.game.logEvent(
          this,
          "equip_fail",
          `Failed to equip ${definition.name}.`,
          undefined,
          { item: definition.name, error: (error as Error).message },
          this.mesh!.position
        );
      }
    }
  }

  /**
   * Unequips the currently held weapon/tool.
   */
  unequipWeapon(): void {
    if (this.equippedWeapon && this.rightHandBone) {
      this.rightHandBone.remove(this.equippedWeapon.modelInstance);
      // Note: We don't dispose geometry/material here as the model might be cached by AssetLoader.
      // AssetLoader should handle disposal if necessary, or manage clones appropriately.
      console.log(
        `${this.name} unequipped ${this.equippedWeapon.definition.name}.`
      );
      if (this.game) {
        this.game.logEvent(
          this,
          "unequip",
          `Unequipped ${this.equippedWeapon.definition.name}.`,
          undefined,
          { item: this.equippedWeapon.definition.name },
          this.mesh!.position
        );
      }
    }
    this.equippedWeapon = null;
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

  transitionToLocomotion(): void {
    if (this.isDead) return;
    const isMoving =
      Math.abs(this.moveState.forward) > 0.1 ||
      Math.abs(this.moveState.right) > 0.1;
    let targetAction: AnimationAction | undefined;
    if (isMoving) {
      targetAction =
        this.isSprinting && this.runAction ? this.runAction : this.walkAction;
      // Fallback if preferred action is missing
      if (!targetAction) targetAction = this.runAction || this.walkAction;
    } else {
      targetAction = this.idleAction;
    }
    // Ensure we always have a fallback to idle if other actions are missing
    if (!targetAction && this.idleAction) {
      targetAction = this.idleAction;
    }
    this.switchAction(targetAction);
  }

  switchAction(newAction: AnimationAction | undefined): void {
    if (this.isDead && newAction !== this.deadAction) return;
    if (!newAction || newAction === this.currentAction) {
      // Ensure the action is playing if it's the current one
      if (newAction && !newAction.isRunning()) newAction.play();
      return;
    }

    const fadeDuration = 0.2;
    if (this.currentAction) {
      this.currentAction.fadeOut(fadeDuration);
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
    // Use weapon damage if equipped, otherwise a default value (e.g., fist damage)
    const baseDamage = this.equippedWeapon
      ? this.equippedWeapon.definition.damage
      : 2;
    // Apply player bonus or use base damage for NPCs
    const damage = this.userData.isPlayer ? baseDamage * 1.5 : baseDamage;

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

    // Use camera direction for player, mesh forward direction for NPC
    if (this.userData.isPlayer && this.game.camera) {
      this.game.camera.getWorldDirection(rayDirection);
    } else {
      this.mesh.getWorldDirection(rayDirection);
    }

    this.rayCaster.set(rayOrigin, rayDirection);
    this.rayCaster.far = range;

    // Filter potential targets (Entities and Resources)
    const potentialTargets = this.game.interactableObjects.filter((item) => {
      if (item === this || item === this.mesh) return false; // Don't target self
      const targetMesh = (item as any).mesh ?? item;
      if (!(targetMesh instanceof Object3D) || !targetMesh.visible)
        return false;
      // Check if entity is dead
      if (item instanceof Entity && item.isDead) return false;
      // Check if resource is depleted
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
    const intersectionPoint = new Vector3(); // Reusable vector

    for (const targetInstance of potentialTargets) {
      const targetMesh = (targetInstance as any).mesh ?? targetInstance;
      if (!(targetMesh instanceof Object3D) || targetMesh instanceof Sprite)
        continue; // Skip invalid meshes/sprites

      const boundingBox = targetMesh.userData.boundingBox as Box3 | undefined;
      if (!boundingBox || boundingBox.isEmpty()) {
        // console.warn(`Skipping attack check for ${targetInstance.name || targetMesh.name}: Missing or empty bounding box.`);
        continue; // Skip if no valid bounding box
      }

      // Check intersection with bounding box
      if (this.rayCaster.ray.intersectsBox(boundingBox)) {
        // Calculate the precise intersection point
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

    // --- Handle Hit ---
    if (closestTarget && closestPoint) {
      const targetMesh = (closestTarget as any).mesh ?? closestTarget;

      // Apply appropriate damage based on equipped weapon type vs target type
      let effectiveDamage = damage;
      if (this.equippedWeapon) {
        const weaponType = this.equippedWeapon.definition.type;
        const weaponId = this.equippedWeapon.definition.id;
        const targetResource = targetMesh.userData.resource;

        if (targetResource === "wood" && weaponId === "axe")
          effectiveDamage *= 2.0; // Axe bonus vs wood
        else if (targetResource === "stone" && weaponId === "pickaxe")
          effectiveDamage *= 2.0; // Pickaxe bonus vs stone
        else if (targetResource && weaponType !== ItemType.Tool)
          effectiveDamage *= 0.5; // Less damage to resources without correct tool type
        else if (
          targetResource &&
          weaponType === ItemType.Tool &&
          weaponId !== "axe" &&
          weaponId !== "pickaxe"
        )
          effectiveDamage *= 0.75; // Generic tool vs resource
        // No damage modification for weapons vs entities or incorrect tools vs resources needed here (base damage applies)
      } else {
        // Fist damage vs resources is low
        if (targetMesh.userData.resource) effectiveDamage *= 0.25;
      }
      effectiveDamage = Math.max(1, Math.round(effectiveDamage)); // Ensure at least 1 damage

      // --- Target is a Resource ---
      if (targetMesh.userData.resource) {
        const resource = targetMesh.userData.resource as string;
        const currentHealth = targetMesh.userData.health as number;
        const maxHealth = targetMesh.userData.maxHealth as number;

        if (currentHealth > 0) {
          const newHealth = Math.max(0, currentHealth - effectiveDamage);
          targetMesh.userData.health = newHealth;
          this.game.notificationManager?.createAttackNumberSprite(
            effectiveDamage,
            closestPoint
          ); // Show damage number

          if (newHealth <= 0) {
            // Resource depleted - Grant item based on resource type
            let itemsToGrant: { id: string; count: number }[] = [];
            if (resource === "wood")
              itemsToGrant.push({ id: "wood", count: MathUtils.randInt(1, 3) });
            else if (resource === "stone")
              itemsToGrant.push({
                id: "stone",
                count: MathUtils.randInt(1, 2),
              });
            else if (resource === "herb")
              itemsToGrant.push({ id: "herb", count: 1 });

            // Check if the gatherer is the player before showing notifications
            if (this === this.game.activeCharacter) {
              for (const itemGrant of itemsToGrant) {
                const addResult = this.inventory?.addItem(
                  itemGrant.id,
                  itemGrant.count
                );
                if (addResult && addResult.added > 0) {
                  this.game.notificationManager?.createItemAddedText(
                    itemGrant.id,
                    addResult.added
                  );
                  this.game.logEvent(
                    this,
                    "gather_complete",
                    `${this.name} gathered ${addResult.totalAdded} ${itemGrant.id}.`,
                    targetMesh.name || targetMesh.id,
                    { resource: itemGrant.id },
                    closestPoint
                  );
                } else {
                  this.game.logEvent(
                    this,
                    "gather_fail",
                    `${this.name}'s inventory full, could not gather ${itemGrant.count} ${itemGrant.id}.`,
                    targetMesh.name || targetMesh.id,
                    { resource: itemGrant.id },
                    closestPoint
                  );
                  break; // Stop trying to add if inventory is full
                }
              }
            } else {
              // NPC gathering, just add items without notification
              for (const itemGrant of itemsToGrant) {
                if (
                  !this.inventory?.addItem(itemGrant.id, itemGrant.count)
                    .totalAdded
                ) {
                  // Log NPC inventory full? (Optional)
                  break;
                }
              }
            }

            // Handle resource depletion and respawn timer
            if (targetMesh.userData.isDepletable) {
              targetMesh.userData.isInteractable = false;
              targetMesh.userData.isCollidable = false;
              targetMesh.visible = false;
              const respawnTime = targetMesh.userData.respawnTime || 15000; // Default respawn time
              setTimeout(() => {
                // Check if mesh still exists and has userData before respawning
                if (targetMesh && targetMesh.userData) {
                  targetMesh.userData.isInteractable = true;
                  targetMesh.userData.isCollidable = true;
                  targetMesh.userData.health = maxHealth; // Reset health
                  targetMesh.visible = true;
                  // Recompute bounding box on respawn? Maybe not needed if size doesn't change.
                }
              }, respawnTime);
            }
          }
        }
      }
      // --- Target is an Entity (Character or Animal) ---
      else if (closestTarget instanceof Entity) {
        closestTarget.takeDamage(effectiveDamage, this, closestPoint); // Pass hit location
        // this.game.spawnParticleEffect(closestPoint, "red"); // Moved to takeDamage
        if (this.game) {
          this.game.logEvent(
            this,
            "attack_hit",
            `${this.name} attacked ${closestTarget.name} for ${effectiveDamage.toFixed(0)} damage.`,
            closestTarget,
            { damage: effectiveDamage },
            this.mesh!.position
          );
        }
      }
    } else {
      // Attack missed or hit nothing
      // Optionally log misses, but can be spammy
      // if (this.game) {
      //   this.game.logEvent(this, "attack_miss", `${this.name} attacked thin air.`, undefined, {}, this.mesh!.position);
      // }
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
        regenRate /= 2; // Slower regen when exhausted
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
    if (this.isDead || !this.mesh) return;
    const forward = new Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
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
    // Add other actions here if needed
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
        this.mesh.position.y = groundY; // Simple clamp for now
      }
      this.velocity.y = 0; // Reset vertical velocity after clamping
    }

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
    this.updateBoundingBox(); // Update box after position change
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;

    // Unequip weapon visually on death
    this.unequipWeapon();

    super.die(attacker); // Sets this.isDead = true, stops velocity, etc.
    this.deathTimestamp = performance.now();

    // AI specific state change
    if (this.aiController) this.aiController.aiState = "dead";

    // Reset action states
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;

    // Play death animation
    if (this.deadAction) {
      this.switchAction(this.deadAction);
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
        this.mesh!.position.clone()
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
      // Drop inventory items? (Optional)
      // this.dropInventory();
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
    this.equippedWeapon = null; // Ensure weapon is unequipped on respawn

    // Reset position and collision state
    this.setPosition(position);
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;

    // Reset AI state if it's an NPC respawning (though usually only player respawns)
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
