/* File: /src/systems/combatSystem.ts */
import { Vector3, Object3D, Box3, Raycaster } from "three";
import { Game } from "../main";
import { Entity } from "../entities/entitiy";
import { Character } from "../entities/character";
import { Animal } from "../entities/animals";
import { getItemDefinition } from "../core/items";
import { MathUtils } from "three";
import { Profession } from "../core/items";

export class CombatSystem {
  private game: Game;
  private raycaster: Raycaster;

  constructor(game: Game) {
    this.game = game;
    this.raycaster = new Raycaster();
  }

  /**
   * Initiates an attack sequence for an entity.
   * If no target is provided (player attack), it finds the nearest valid target.
   * @param attacker The entity initiating the attack.
   * @param target Optional: The specific target to attack (used by AI).
   */
  initiateAttack(
    attacker: Character | Animal,
    target?: Entity | Object3D
  ): void {
    if (attacker.isDead || attacker.isPerformingAction || !this.game.clock) {
      return;
    }

    // Check attack cooldown
    const now = this.game.clock.elapsedTime;
    if (now < attacker.lastAttackTime + attacker.attackCooldown) {
      // console.log(`${attacker.name} attack on cooldown.`);
      return; // Still on cooldown
    }

    let finalTarget: Entity | Object3D | null = target ?? null;

    // If no target provided (player attack), find the nearest one
    if (!finalTarget && attacker === this.game.activeCharacter) {
      finalTarget = this.findNearestTarget(attacker, attacker.getAttackRange());
    }

    if (!finalTarget) {
      // console.log(`${attacker.name} initiated attack but found no target.`);
      // Optionally play a miss animation or sound here
      // For now, just reset cooldown slightly to prevent spamming misses
      attacker.lastAttackTime = now - attacker.attackCooldown * 0.5; // Allow trying again sooner
      return;
    }

    // Make attacker look at the target
    const targetPosition =
      finalTarget instanceof Entity
        ? finalTarget.mesh!.position
        : finalTarget.position;
    attacker.lookAt(targetPosition);

    // Start the attack
    attacker.lastAttackTime = now;
    attacker.playAttackAnimation(); // Trigger the animation in the entity

    // Execute the attack logic (damage, effects) immediately after starting animation
    // In a more complex system, this might be delayed or tied to animation frames
    this.executeAttack(attacker, finalTarget);
  }

  /**
   * Finds the nearest valid attack target within range and view angle.
   * @param attacker The entity searching for a target.
   * @param range The maximum attack range.
   * @returns The closest valid target (Entity or resource Object3D), or null.
   */
  findNearestTarget(attacker: Entity, range: number): Entity | Object3D | null {
    if (!attacker.mesh || !this.game.scene) return null;

    const attackerPosition = attacker.mesh.position;
    const attackerDirection = attacker.mesh.getWorldDirection(new Vector3());
    const rangeSq = range * range;
    let closestTarget: Entity | Object3D | null = null;
    let minDistanceSq = rangeSq;

    // Check interactable objects (includes Characters, Animals, Resources)
    for (const potentialTarget of this.game.interactableObjects) {
      if (potentialTarget === attacker || potentialTarget === attacker.mesh)
        continue;

      const targetMesh = (potentialTarget as any).mesh ?? potentialTarget;
      if (!(targetMesh instanceof Object3D) || !targetMesh.visible) continue;

      // Check if entity is dead or resource depleted/falling
      if (potentialTarget instanceof Entity && potentialTarget.isDead) continue;
      if (
        targetMesh.userData.resource &&
        (targetMesh.userData.health <= 0 || targetMesh.userData.isFalling)
      )
        continue;

      const targetPosition = targetMesh.getWorldPosition(new Vector3());
      const distanceSq = attackerPosition.distanceToSquared(targetPosition);

      if (distanceSq < minDistanceSq) {
        // Check angle (optional, simple cone check)
        const directionToTarget = targetPosition
          .clone()
          .sub(attackerPosition)
          .normalize();
        const angle = attackerDirection.angleTo(directionToTarget);

        // Allow wider angle for player targeting? Adjust tolerance as needed.
        const angleTolerance = Math.PI / 2.5; // Approx 72 degrees cone
        if (angle < angleTolerance) {
          // Optional: Line of sight check
          // this.raycaster.set(attackerPosition.clone().add(new Vector3(0, attacker.userData.height * 0.5, 0)), directionToTarget);
          // this.raycaster.far = Math.sqrt(distanceSq);
          // const intersects = this.raycaster.intersectObjects(this.game.collidableObjects.filter(o => o !== attacker.mesh && o !== targetMesh), false);
          // if (intersects.length === 0) { // No obstructions
          minDistanceSq = distanceSq;
          closestTarget = potentialTarget;
          // }
        }
      }
    }

    return closestTarget;
  }

  /**
   * Executes the core attack logic: calculates damage, applies it, triggers effects.
   * @param attacker The attacking entity.
   * @param target The target entity or resource object.
   */
  executeAttack(attacker: Character | Animal, target: Entity | Object3D): void {
    if (attacker.isDead || !this.game.clock) return;

    const baseDamage = attacker.getAttackDamage();
    const targetMesh = (target as any).mesh ?? target;
    const targetPosition = targetMesh.getWorldPosition(new Vector3()); // Position for effects

    // --- Calculate Damage Modifiers ---
    let damageMultiplier = 1.0;
    const targetIsEntity = target instanceof Entity;
    const targetResource = targetMesh.userData.resource;
    const weaponId =
      attacker instanceof Character
        ? attacker.equippedWeapon?.definition.id
        : null;

    // 1. Profession Weapon Efficiency Bonus (Only for Characters)
    if (attacker instanceof Character && attacker.equippedWeapon) {
      const weaponDef = attacker.equippedWeapon.definition;
      let efficientProfession: Profession | null = null;
      if (weaponDef.id === "sword") efficientProfession = Profession.Hunter;
      else if (weaponDef.id === "pickaxe")
        efficientProfession = Profession.Blacksmith;
      else if (weaponDef.id === "axe") efficientProfession = Profession.Farmer;

      if (
        efficientProfession &&
        attacker.professions.has(efficientProfession)
      ) {
        damageMultiplier *= 1.5; // 50% bonus (Adjust as needed)
      }
    }

    // 2. Weapon vs Target Bonus
    if (weaponId === "sword" && targetIsEntity) {
      damageMultiplier *= 1.5; // Swords better against entities
    } else if (weaponId === "axe" && targetResource === "wood") {
      damageMultiplier *= 2.0; // Axes better against wood
    } else if (weaponId === "pickaxe" && targetResource === "stone") {
      damageMultiplier *= 2.0; // Pickaxes better against stone
    }

    // 3. Add bonus damage from upgrades (Only for Characters)
    const bonusDamage =
      attacker instanceof Character ? attacker.bonusDamage : 0;
    const effectiveDamage = Math.max(
      1,
      Math.round(baseDamage * damageMultiplier) + bonusDamage
    );

    // --- Apply Damage ---
    let targetName = "Object";
    let targetId = targetMesh.uuid;

    if (target instanceof Entity) {
      targetName = target.name;
      targetId = target.id;
      target.takeDamage(effectiveDamage, attacker, targetPosition);
    } else if (targetMesh.userData.resource) {
      // Handle resource damage
      targetName = targetMesh.userData.resource;
      targetId = targetMesh.userData.id || targetMesh.uuid;
      const currentHealth = targetMesh.userData.health as number;
      const maxHealth = targetMesh.userData.maxHealth as number;

      if (currentHealth > 0) {
        const newHealth = Math.max(0, currentHealth - effectiveDamage);
        targetMesh.userData.health = newHealth;

        if (newHealth <= 0) {
          // Resource depleted - Grant item
          this.handleResourceDepletion(attacker, targetMesh, targetPosition);
        }
      }
    } else {
      console.warn(
        `Attack target is neither Entity nor known Resource: ${targetMesh.name}`
      );
      return; // Don't apply damage or effects to unknown objects
    }

    // --- Effects and Logging ---
    this.game.notificationManager?.createAttackNumberSprite(
      effectiveDamage,
      targetPosition
    );
    this.game.spawnParticleEffect(targetPosition, "red");

    // Log the hit
    this.game.logEvent(
      attacker,
      "attack_hit",
      `${attacker.name} attacked ${targetName} for ${effectiveDamage.toFixed(0)} damage.`,
      target, // Pass original target ref
      { damage: effectiveDamage },
      attacker.mesh!.position
    );

    // Update AI's last logged target if applicable
    if (attacker.aiController) {
      attacker.aiController.lastLoggedAttackTargetId = targetId;
    }
  }

  /**
   * Handles item granting and visual changes when a resource is depleted.
   */
  private handleResourceDepletion(
    gatherer: Entity,
    resourceMesh: Object3D,
    position: Vector3
  ): void {
    const resource = resourceMesh.userData.resource as string;
    const maxHealth = resourceMesh.userData.maxHealth as number;
    let itemsToGrant: { id: string; count: number }[] = [];

    if (resource === "wood")
      itemsToGrant.push({ id: "wood", count: MathUtils.randInt(1, 3) });
    else if (resource === "stone")
      itemsToGrant.push({ id: "stone", count: MathUtils.randInt(1, 2) });
    else if (resource === "herb") itemsToGrant.push({ id: "herb", count: 1 });

    // Add items to gatherer's inventory (if Character)
    if (gatherer instanceof Character && gatherer.inventory) {
      for (const itemGrant of itemsToGrant) {
        const addResult = gatherer.inventory.addItem(
          itemGrant.id,
          itemGrant.count
        );
        if (addResult && addResult.added > 0) {
          // Show notification only for the active player
          if (gatherer === this.game.activeCharacter) {
            this.game.notificationManager?.createItemAddedSprite(
              itemGrant.id,
              addResult.added,
              position
            );
          }
          this.game.logEvent(
            gatherer,
            "gather_complete",
            `${gatherer.name} gathered ${addResult.totalAdded} ${itemGrant.id}.`,
            resourceMesh.userData.name || resourceMesh.userData.id,
            { resource: itemGrant.id },
            position
          );
        } else {
          this.game.logEvent(
            gatherer,
            "gather_fail",
            `${gatherer.name}'s inventory full, could not gather ${itemGrant.count} ${itemGrant.id}.`,
            resourceMesh.userData.name || resourceMesh.userData.id,
            { resource: itemGrant.id },
            position
          );
          break; // Stop trying to add if inventory is full
        }
      }
    } else if (gatherer instanceof Animal) {
      // Animals don't have inventories, maybe drop items?
      // For now, just log that the animal destroyed it.
      this.game.logEvent(
        gatherer,
        "destroy_resource",
        `${gatherer.name} destroyed a ${resource}.`,
        resourceMesh.userData.name || resourceMesh.id,
        { resource: resource },
        position
      );
    }

    // Handle resource visual state and respawn timer
    if (
      resourceMesh.userData.resource === "wood" &&
      resourceMesh.userData.mixer &&
      resourceMesh.userData.fallAction &&
      !resourceMesh.userData.isFalling
    ) {
      // Tree falling animation (handled in main loop)
      resourceMesh.userData.isFalling = true;
      resourceMesh.userData.fallAction.reset().play();
    } else if (resourceMesh.userData.isDepletable) {
      // Non-tree depletion (immediate)
      resourceMesh.userData.isInteractable = false;
      resourceMesh.userData.isCollidable = false;
      resourceMesh.visible = false;
      const respawnTime = resourceMesh.userData.respawnTime || 15000;
      setTimeout(() => {
        if (resourceMesh && resourceMesh.userData) {
          resourceMesh.userData.isInteractable = true;
          resourceMesh.userData.isCollidable = true;
          resourceMesh.userData.health = maxHealth;
          resourceMesh.visible = true;
        }
      }, respawnTime);
    }
  }

  update(deltaTime: number): void {
    // Currently no per-frame updates needed for combat system itself
    // Cooldowns are checked within initiateAttack
  }
}
